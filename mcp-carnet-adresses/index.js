import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { MongoClient } from "mongodb";
import { z } from "zod";
import express from "express";
import cors from "cors";
import "dotenv/config";

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db("db");
const contacts = db.collection("users");
console.log("Connecté à MongoDB");

function createServer() {
  const server = new McpServer({ name: "mcp-carnet-adresses", version: "1.0.0" });

  // --- 1. TOOL : AJOUTER ---
  server.tool(
    "ajouter_utilisateur",
    "Ajoute un nouveau contact professionnel dans le carnet d'adresses.",
    {
      nom: z.string().describe("Nom complet"),
      age: z.number().optional().describe("Âge en années"),
      profession: z.string().describe("Intitulé du poste"),
      bio: z.string().describe("Courte biographie descriptive"),
      competences: z.array(z.string()).optional().describe("Liste des compétences clés"),
      localisation: z.string().optional().describe("Ville et pays"),
    },
    async ({ nom, age, profession, bio, competences, localisation }) => {
      try {
        const result = await contacts.insertOne({
          nom,
          age: age ?? null,
          profession,
          bio,
          competences: competences ?? [],
          localisation: localisation ?? "Non spécifiée",
          createdAt: new Date(),
        });
        return {
          content: [{ type: "text", text: ` "${nom}" a été ajouté (ID: ${result.insertedId})` }]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: ` Erreur : ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // --- 2. TOOL : LIRE UN UTILISATEUR ---
  server.tool(
    "lire_utilisateur",
    "Recherche et renvoie les informations d'un contact existant dans le carnet d'adresses à partir de son nom.",
    {
      nom: z.string().describe("Le nom (ou une partie du nom) de l'utilisateur à chercher"),
    },
    async ({ nom }) => {
      try {
        const user = await contacts.findOne({ nom: { $regex: new RegExp(nom, "i") } });
        if (!user) {
          return { content: [{ type: "text", text: `Aucun utilisateur trouvé avec le nom "${nom}".` }] };
        }
        return {
          content: [{ type: "text", text: `Utilisateur trouvé :\n${JSON.stringify(user, null, 2)}` }]
        };
      } catch (error) {
        return { content: [{ type: "text", text: `Erreur de lecture : ${error.message}` }], isError: true };
      }
    }
  );

  // --- 3. TOOL : SUPPRIMER ---
  server.tool(
    "supprimer_utilisateur",
    "Supprime définitivement un contact. S'il y a des homonymes, il FAUT utiliser la profession pour cibler le bon.",
    {
      nom: z.string().describe("Le nom de l'utilisateur à supprimer"),
      profession: z.string().optional().describe("La profession pour éviter de supprimer le mauvais homonyme (ex: 'devops')")
    },
    async ({ nom, profession }) => {
      try {
        const query = { nom: { $regex: new RegExp(nom.trim(), "i") } };
        
        if (profession) {
          query.profession = { $regex: new RegExp(profession.trim(), "i") };
        }

        const users = await contacts.find(query).toArray();

        if (users.length === 0) {
          return { content: [{ type: "text", text: `Suppression impossible : aucun utilisateur nommé "${nom}" (avec ces critères) n'existe.` }] };
        }

        if (users.length > 1) {
          return { content: [{ type: "text", text: `ERREUR CRITIQUE : Il y a ${users.length} personnes nommées "${nom}". Opération annulée. Tu dois relancer cet outil en renseignant le champ 'profession' pour cibler la bonne personne.` }] };
        }

        await contacts.deleteOne({ _id: users[0]._id });

        return {
          content: [{ type: "text", text: `L'utilisateur "${nom}" a été supprimé avec succès.` }]
        };
      } catch (error) {
        return { content: [{ type: "text", text: `Erreur de suppression : ${error.message}` }], isError: true };
      }
    }
  );

  // --- 4. TOOL : LIRE TOUS LES UTILISATEURS ---
  server.tool(
    "lire_tous_utilisateurs",
    "Récupère et affiche la liste complète de tous les contacts présents dans le carnet d'adresses.",
    {},
    async () => {
      try {
        const allUsers = await contacts.find({}).toArray();
        if (allUsers.length === 0) {
          return { content: [{ type: "text", text: "📭 Le carnet d'adresses est actuellement vide." }] };
        }
        return {
          content: [{ type: "text", text: `Voici tous les contacts du carnet :\n${JSON.stringify(allUsers, null, 2)}` }]
        };
      } catch (error) {
        return { content: [{ type: "text", text: `Erreur lors de la lecture globale : ${error.message}` }], isError: true };
      }
    }
  );

  // --- 5. TOOL : MODIFIER ---
  server.tool(
    "modifier_utilisateur",
    "Modifie les informations d'un contact existant. S'il y a des homonymes, il FAUT utiliser la profession actuelle pour cibler le bon.",
    {
      nom_actuel: z.string().describe("Le nom exact du contact à modifier (obligatoire)"),
      profession_actuelle: z.string().optional().describe("La profession actuelle de la personne pour la distinguer d'un homonyme"),
      nouveau_nom: z.string().optional().describe("Nouveau nom (uniquement s'il doit être changé)"),
      age: z.number().optional().describe("Nouvel âge"),
      profession: z.string().optional().describe("Nouvelle profession"),
      bio: z.string().optional().describe("Nouvelle biographie"),
      localisation: z.string().optional().describe("Nouvelle localisation"),
      competences: z.array(z.string()).optional().describe("Nouvelles compétences. DOIT être un tableau JSON")
    },
    async ({ nom_actuel, profession_actuelle, nouveau_nom, age, profession, bio, localisation, competences }) => {
      try {
        const query = { nom: { $regex: new RegExp(nom_actuel.trim(), "i") } };
        if (profession_actuelle) {
          query.profession = { $regex: new RegExp(profession_actuelle.trim(), "i") };
        }

        const users = await contacts.find(query).toArray();

        if (users.length === 0) {
          return { content: [{ type: "text", text: `Modification impossible : aucun utilisateur nommé "${nom_actuel}" n'existe avec ces critères.` }] };
        }

        if (users.length > 1) {
          return { content: [{ type: "text", text: `ERREUR CRITIQUE : Il y a ${users.length} personnes nommées "${nom_actuel}". Précise sa 'profession_actuelle' pour que je sache lequel modifier.` }] };
        }

        const updateFields = {};
        if (nouveau_nom)
          updateFields.nom = nouveau_nom;
        if (age !== undefined)
          updateFields.age = age;
        if (profession)
          updateFields.profession = profession;
        if (bio)
          updateFields.bio = bio;
        if (localisation)
          updateFields.localisation = localisation;
        if (Array.isArray(competences) && competences.length > 0) updateFields.competences = competences;

        if (Object.keys(updateFields).length === 0) {
          return { content: [{ type: "text", text: `Aucune nouvelle information n'a été fournie pour mettre à jour ${nom_actuel}.` }] };
        }

        await contacts.updateOne(
          { _id: users[0]._id },
          { $set: updateFields }
        );

        return {
          content: [{ type: "text", text: `Le profil de "${nom_actuel}" a été mis à jour avec succès dans la base de données.` }]
        };
      } catch (error) {
        return { content: [{ type: "text", text: `Erreur lors de la modification : ${error.message}` }], isError: true };
      }
    }
  );

  // --- 6. TOOL : COMPARER ---
  server.tool(
    "comparer_competences",
    "Compare les compétences de deux contacts et identifie les compétences communes et différentes",
    {
      nom1: z.string().describe("Nom du premier contact"),
      nom2: z.string().describe("Nom du deuxième contact"),
    },
    async ({ nom1, nom2 }) => {
      const contact1 = await contacts.findOne({ nom: new RegExp(nom1, "i") });
      const contact2 = await contacts.findOne({ nom: new RegExp(nom2, "i") });

      if (!contact1) return { content: [{ type: "text", text: `Contact "${nom1}" introuvable` }] };
      if (!contact2) return { content: [{ type: "text", text: `Contact "${nom2}" introuvable` }] };

      const comp1 = contact1.competences?.map(c => c.toLowerCase()) ?? [];
      const comp2 = contact2.competences?.map(c => c.toLowerCase()) ?? [];

      const communes = comp1.filter(c => comp2.includes(c));
      const complementaires = [
        ...comp1.filter(c => !comp2.includes(c)),
        ...comp2.filter(c => !comp1.includes(c)),
      ];

      let score = 0;
      let points = [];

      // 1. PROFESSION — critère principal (max 60 pts)
      if (contact1.profession?.toLowerCase() === contact2.profession?.toLowerCase()) {
        score += 60;
        points.push(`Même profession (${contact1.profession}) → collaboration en équipe très probable`);
      } else {
        const domaines = {
          tech: ["développeur", "ingénieur", "data", "devops", "architecte", "administrateur"],
          business: ["manager", "directeur", "commercial", "chef de projet"],
          creative: ["designer", "graphiste", "artiste", "acteur", "réalisateur"],
        };
        const getDomaine = (prof) => {
          if (!prof) return null;
          const p = prof.toLowerCase();
          return Object.entries(domaines).find(([, mots]) => mots.some(m => p.includes(m)))?.[0] ?? null;
        };
        const d1 = getDomaine(contact1.profession);
        const d2 = getDomaine(contact2.profession);
        if (d1 && d2 && d1 === d2) {
          score += 30;
          points.push(`Même domaine (${contact1.profession} / ${contact2.profession}) → collaboration possible`);
        } else {
          score += 5;
          points.push(`Professions très différentes (${contact1.profession} / ${contact2.profession}) → collaboration improbable`);
        }
      }

      // 2. COMPÉTENCES COMMUNES — critère secondaire (max 30 pts)
      if (communes.length >= 5) {
        score += 30;
        points.push(`Nombreuses compétences communes (${communes.length}) → très bonne base`);
      } else if (communes.length >= 2) {
        score += 20;
        points.push(`Quelques compétences communes (${communes.length}) → base correcte`);
      } else if (communes.length === 1) {
        score += 10;
        points.push(`1 seule compétence commune → base faible`);
      } else {
        points.push(`Aucune compétence commune → communication difficile`);
      }

      // 3. COMPÉTENCES COMPLÉMENTAIRES — bonus mineur (max 10 pts)
      if (complementaires.length >= 5) {
        score += 10;
        points.push(`Compétences complémentaires (${complementaires.length}) → apport mutuel mais rôles différents`);
      } else if (complementaires.length > 0) {
        score += 5;
        points.push(`Quelques compétences complémentaires (${complementaires.length}) → légère synergie`);
      }

      // VERDICT
      const verdict = score >= 70
        ? "Ils peuvent tout à fait collaborer ensemble dans la même équipe"
        : score >= 40
          ? "Ils peuvent collaborer mais pas dans la même équipe"
          : "Ils ne peuvent pas du tout collaborer";

      const texte = `
      ${contact1.nom} peut-il travailler avec ${contact2.nom} ?
      ${"─".repeat(50)}
      ${verdict} — Score : ${score}/100

      Analyse :
      ${points.map(p => `   ${p}`).join("\n")}

      Compétences communes : ${communes.length > 0 ? communes.join(", ") : "aucune"}
      Compétences complémentaires : ${complementaires.slice(0, 5).join(", ")}${complementaires.length > 5 ? "..." : ""}
          `.trim();

      return { content: [{ type: "text", text: texte }] };
    }
  );

  // --- 7. TOOL : CRÉATION ÉQUIPE ---
  server.tool(
    "creation_equipe",
    "Crée une équipe ayant les compétences pour le projet",
    {
      nom_projet: z.string().describe("Nom du projet"),
      description_projet: z.string().describe("Description du projet et de ses objectifs"),
    },
    async ({ nom_projet, description_projet }) => {
      const allUsers = await contacts.find({}).toArray();

      if (allUsers.length === 0) return { content: [{ type: "text", text: `Aucun utilisateur dans le carnet d'adresses` }] };

      const normaliser = (texte) => {
        if (!texte) return "";
        return texte.toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9\s]/g, " ");
      }

      const desc_proj = normaliser(description_projet);

      const scoreUsers = allUsers.map(user => {
        const competences = user.competences ?? [];
        const comparaisonComp = competences.filter(comp => desc_proj.includes(normaliser(comp)));
        const professionMatch = user.profession && desc_proj.includes(normaliser(user.profession));
        const score = (comparaisonComp.length * 20) + (professionMatch ? 20 : 0);

        return { user, comparaisonComp, professionMatch, score };
      });

      scoreUsers.sort((a, b) => b.score - a.score);
      const candidats = scoreUsers.filter(c => c.score > 20);

      if (candidats.length === 0) {
        return {
          content: [{
            type: "text",
            text: `Aucun contact ne correspond à la description du projet "${nom_projet}".\n\nDescription analysée :\n"${description_projet}"\n\nAucune compétence des contacts ne correspond aux termes du projet.`
          }]
        };
      }

      const equipe = [];
      const competencesCouvertes = new Set();

      for (const candidat of candidats) {
        const apporteNouveau = candidat.comparaisonComp.some(c => !competencesCouvertes.has(c));
        if (apporteNouveau || equipe.length === 0) {
          equipe.push(candidat);
          candidat.comparaisonComp.forEach(c => competencesCouvertes.add(c));
        }
      }

      for (const candidat of candidats) {
        if (!equipe.includes(candidat)) equipe.push(candidat);
      }

      const toutesCompetences = [...new Set(allUsers.flatMap(c => c.competences ?? []))];
      const competencesDetectees = toutesCompetences.filter(comp =>
        desc_proj.includes(normaliser(comp))
      );

      const competencesManquantes = competencesDetectees.filter(c => !competencesCouvertes.has(c));

      const membresTxt = equipe.map((m, i) => `
    ${i + 1}. ${m.user.nom} — ${m.user.profession ?? "—"}
      Compétences utiles : ${m.comparaisonComp.join(", ") || "—"}
      ${m.professionMatch ? `Profession en lien avec le projet\n      ` : ""} Score : ${m.score} pts
    `.trim()).join("\n\n");

      const texte = `
    ÉQUIPE POUR : ${nom_projet}
    ${"─".repeat(50)}
    Description : ${description_projet}

    Compétences détectées dans la description :
      ${competencesDetectees.length > 0 ? competencesDetectees.join(", ") : "Aucune compétence reconnue"}

    ${"─".repeat(50)}
    ÉQUIPE SÉLECTIONNÉE (${equipe.length} membre(s)) :

    ${membresTxt}

    ${"─".repeat(50)}
    Compétences couvertes : ${[...competencesCouvertes].join(", ") || "—"}

    ${competencesManquantes.length > 0
          ? `Compétences non couvertes : ${competencesManquantes.join(", ")}\n   → Recrutement recommandé sur ces points.`
          : "Toutes les compétences détectées sont couvertes !"}
        `.trim();

      return { content: [{ type: "text", text: texte }] };
    }
  );

  // --- enririchir depuis un profil git hub ---
  server.tool(
    "enrichir_profil_github",
    "Recherche des informations publiques sur un développeur via son pseudo GitHub pour enrichir son profil (bio, entreprise, localisation).",
    {
      pseudo: z.string().describe("Le pseudo GitHub exact de la cible (ex: torvalds)"),
    },
    async ({ pseudo }) => {
      try {
        const response = await fetch(`https://api.github.com/users/${pseudo}`);
        
        if (response.status === 404) {
          return { content: [{ type: "text", text: `❌ Cible introuvable : Aucun profil GitHub ne correspond au pseudo "${pseudo}".` }] };
        }
        
        if (!response.ok) {
          throw new Error(`Erreur API GitHub : ${response.statusText}`);
        }

        const data = await response.json();

        const infos = {
          nom_complet: data.name || data.login,
          entreprise: data.company || "Indépendant / Non spécifié",
          localisation: data.location || "Non spécifiée",
          bio: data.bio || "Aucune biographie publique.",
          followers: data.followers
        };

        return {
          content: [{ 
            type: "text", 
            text: `Données OSINT récupérées avec succès :\n${JSON.stringify(infos, null, 2)}\n\nTu peux maintenant utiliser ces informations pour ajouter ou modifier ce contact.` 
          }]
        };
      } catch (error) {
        return { content: [{ type: "text", text: `Échec de l'enrichissement : ${error.message}` }], isError: true };
      }
    }
  );

  return server;
}

// --- EXPRESS SERVER CONFIG ---
const app = express();
app.use(express.json());
app.use(cors());

app.get("/api/contacts", async (req, res) => {
  try {
    const allUsers = await contacts.find({}).toArray();
    res.json(allUsers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.all("/stream", async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(` MCP Carnet d'adresses sur http://mcp:3001/stream`);
});