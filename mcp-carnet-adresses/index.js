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
console.log("✅ Connecté à MongoDB");


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
          content: [{ type: "text", text: `✅ "${nom}" a été ajouté (ID: ${result.insertedId})` }]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `❌ Erreur : ${error.message}` }],
          isError: true,
        };
      }
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
  console.log(`🚀 MCP Carnet d'adresses sur http://mcp:3001/stream`);
});