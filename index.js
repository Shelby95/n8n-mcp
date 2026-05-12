import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { MongoClient } from "mongodb";

const MONGO_URI = "mongodb+srv://admin_bd:adminusers@cluster0.hojwogl.mongodb.net/?appName=Cluster0"; 
const client = new MongoClient(MONGO_URI);
let db;

const server = new Server(
  {
    name: "mcp-carnet-adresses",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "ajouter_utilisateur",
        description: "Ajoute un nouveau contact professionnel dans le carnet d'adresses.",
        inputSchema: {
          type: "object",
          properties: {
            nom: { type: "string", description: "Nom complet" },
            age: { type: "number", description: "Âge en années" },
            profession: { type: "string", description: "Intitulé du poste" },
            bio: { type: "string", description: "Courte biographie descriptive" },
            competences: { 
              type: "array", 
              items: { type: "string" },
              description: "Liste des compétences clés" 
            },
            localisation: { type: "string", description: "Ville et pays" }
          },
          required: ["nom", "profession", "bio"], // Champs obligatoires
        },
      },
    ],
  };
});


server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "ajouter_utilisateur") {
    try {
      const donneesUtilisateur = request.params.arguments;
      const collection = db.collection("utilisateurs");

      await collection.insertOne({
        nom: donneesUtilisateur.nom,
        age: donneesUtilisateur.age || null,
        profession: donneesUtilisateur.profession,
        bio: donneesUtilisateur.bio,
        competences: donneesUtilisateur.competences || [],
        localisation: donneesUtilisateur.localisation || "Non spécifiée"
      });

      return {
        content: [
          {
            type: "text",
            text: `Succès : L'utilisateur ${donneesUtilisateur.nom} a été ajouté à la base de données.`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Erreur base de données : ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  throw new Error(`Outil inconnu : ${request.params.name}`);
});

async function run() {
  try {
    await client.connect();
    db = client.db("carnet_adresses");
    console.error("Connecté à MongoDB avec succès.");

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Serveur MCP démarré et prêt à écouter.");
  } catch (error) {
    console.error("Erreur fatale au démarrage :", error);
    process.exit(1);
  }
}

run();