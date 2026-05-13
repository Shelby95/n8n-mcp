import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { MongoClient } from "mongodb";
import { z } from "zod"; // comparer les types
import express from "express";
import "dotenv/config"; // charge automatiquement le fichier .env

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect(); 
const db = client.db("db");
const contacts = db.collection("users");
console.log("Connecté à MongoDB");


function createServer() {
  const server = new McpServer({ name: "mcp-carnet-adresses", version: "1.0.0" });

  server.tool(
    "ajouter_utilisateur",
    "Ajoute un nouveau contact professionnel dans le carnet d'adresses.",
    {
      nom:          z.string().describe("Nom complet"),
      age:          z.number().optional().describe("Âge en années"),
      profession:   z.string().describe("Intitulé du poste"),
      bio:          z.string().describe("Courte biographie descriptive"),
      competences:  z.array(z.string()).optional().describe("Liste des compétences clés"),
      localisation: z.string().optional().describe("Ville et pays"),
    },
    async ({ nom, age, profession, bio, competences, localisation }) => {
      try {
        const result = await contacts.insertOne({
          nom,
          age:          age ?? null,
          profession,
          bio,
          competences:  competences ?? [],
          localisation: localisation ?? "Non spécifiée",
          createdAt:    new Date(),
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

  server.tool(
    "supprimer_utilisateur",
    "Supprime définitivement un contact du carnet d'adresses.",
    {
      nom: z.string().describe("Le nom exact de l'utilisateur à supprimer"),
    },
    async ({ nom }) => {
      try {
        const result = await contacts.deleteOne({ nom: { $regex: new RegExp(`^${nom}$`, "i") } });
        
        if (result.deletedCount === 0) {
          return { content: [{ type: "text", text: `Suppression impossible : aucun utilisateur nommé "${nom}" n'existe.` }] };
        }
        return {
          content: [{ type: "text", text: `L'utilisateur "${nom}" a été supprimé avec succès de la base de données.` }]
        };
      } catch (error) {
        return { content: [{ type: "text", text: `Erreur de suppression : ${error.message}` }], isError: true };
      }
    }
  );

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

  server.tool(
    "modifier_utilisateur",
    "Modifie les informations d'un contact existant. Seuls les champs renseignés seront mis à jour.",
    {
      nom_actuel:   z.string().describe("Le nom exact du contact à modifier (obligatoire pour le trouver)"),
      nouveau_nom:  z.string().optional().describe("Nouveau nom (uniquement s'il doit être changé)"),
      age:          z.number().optional().describe("Nouvel âge"),
      profession:   z.string().optional().describe("Nouvelle profession"),
      bio:          z.string().optional().describe("Nouvelle biographie"),
      localisation: z.string().optional().describe("Nouvelle localisation")
    },
    async ({ nom_actuel, nouveau_nom, age, profession, bio, localisation }) => {
      try {
        const updateFields = {};
        if (nouveau_nom) updateFields.nom = nouveau_nom;
        if (age !== undefined) updateFields.age = age;
        if (profession) updateFields.profession = profession;
        if (bio) updateFields.bio = bio;
        if (localisation) updateFields.localisation = localisation;

        // Si l'IA n'a envoyé aucun champ à modifier
        if (Object.keys(updateFields).length === 0) {
          return { content: [{ type: "text", text: `Aucune nouvelle information n'a été fournie pour mettre à jour ${nom_actuel}.` }] };
        }

        const result = await contacts.updateOne(
          { nom: { $regex: new RegExp(`^${nom_actuel}$`, "i") } }, // Recherche insensible à la casse
          { $set: updateFields }
        );

        if (result.matchedCount === 0) {
          return { content: [{ type: "text", text: `Modification impossible : aucun utilisateur nommé "${nom_actuel}" n'existe dans la base.` }] };
        }
        return {
          content: [{ type: "text", text: `Le profil de "${nom_actuel}" a été mis à jour avec succès dans la base de données.` }]
        };
      } catch (error) {
        return { content: [{ type: "text", text: `Erreur lors de la modification : ${error.message}` }], isError: true };
      }
    }
  );

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

    if (!contact1) return { content: [{ type: "text", text: `❌ Contact "${nom1}" introuvable` }] };
    if (!contact2) return { content: [{ type: "text", text: `❌ Contact "${nom2}" introuvable` }] };

    const comp1 = contact1.competences?.map(c => c.toLowerCase()) ?? [];
    const comp2 = contact2.competences?.map(c => c.toLowerCase()) ?? [];

     const communes        = comp1.filter(c => comp2.includes(c));
    const complementaires = [
      ...comp1.filter(c => !comp2.includes(c)),
      ...comp2.filter(c => !comp1.includes(c)),
    ];

    let score = 0;
    let points = [];

    // Compétences complémentaires = bonne collaboration
    if (complementaires.length > 0) {
      score += 40;
      points.push(`Compétences complémentaires (${complementaires.length} différentes) → bonne répartition des rôles`);
    }

    // Quelques compétences communes = langage commun
    if (communes.length > 0 && communes.length <= 3) {
      score += 30;
      points.push(`${communes.length} compétence(s) en commun → base de communication solide`);
    } else if (communes.length > 3) {
      score += 15;
      points.push(`Beaucoup de compétences identiques (${communes.length}) → risque de redondance`);
    }

    // Professions différentes = complémentarité
    if (contact1.profession?.toLowerCase() !== contact2.profession?.toLowerCase()) {
      score += 20;
      points.push(`Professions (${contact1.profession} / ${contact2.profession}) → complémentarité métier`);
    } else {
      score += 10;
      points.push(`ℹ : Même profession → collaboration possible mais profils similaires`);
    }

    const verdict = score >= 70 ? "Ils peuvent tout à fait collaborer ensemble dans la même équipe"
                  : score <= 60 ? "Ils peuvent collaborer mais pas dans la même équipe"
                  :               "Ils ne peuvent pas du tout collaborer";

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

  return server;
}

const app = express();
app.use(express.json());

app.all("/stream", async (req, res) => {
  const server = createServer(); // nouvelle instance à chaque requête
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});


const PORT = 3001;
app.listen(PORT, () => {
  console.log(` MCP Carnet d'adresses sur http://mcp:3001/stream`);
});