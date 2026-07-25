import { createGroq } from '@ai-sdk/groq';
import { generateText } from 'ai';
import { getSyncedEngine, persistFactory } from '@/lib/server/synced-engine';

export async function POST(req: Request) {
  if (!process.env.GROQ_API_KEY) {
    return new Response(JSON.stringify({ error: 'GROQ_API_KEY is not configured.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const groq = createGroq({
    apiKey: process.env.GROQ_API_KEY,
  });

  const { messages } = await req.json();
  const engine = await getSyncedEngine();

  const clusterState = engine.getState();
  const factoryList = clusterState.factories.map(f => `• ${f.name} [${f.id}] (${f.industryType}) — wastes: ${f.declaredWastes.join(', ')}`).join('\n');
  const matchList = clusterState.matches.slice(0, 10).map(m => `• ${m.wasteStreamName}: ${m.sourceFactoryName} → ${m.targetFactoryName} (score: ${m.compatibilityScore}%)`).join('\n');
  const productList = clusterState.products.slice(0, 5).map(p => `• ${p.name} — ${p.description} (feasibility: ${p.feasibilityScore}%)`).join('\n');

  const systemPrompt = `You are the SymBioForge AI Assistant embedded inside the SymBioForge industrial symbiosis platform.
You help users manage their industrial symbiosis network.

CAPABILITIES:
- You can answer questions about factories, waste streams, matches, carbon metrics, and the platform.
- When users ask to CREATE or REGISTER a factory, ask them for the details, then output a JSON block that the system will parse to create it. Use this EXACT format:

\`\`\`REGISTER_FACTORY
{
  "name": "Factory Name",
  "industryType": "Chemical",
  "address": "Location",
  "productionCapacity": "500 tons/month",
  "rawMaterials": ["Material 1", "Material 2"],
  "declaredWastes": ["Waste 1", "Waste 2"]
}
\`\`\`

Valid waste names: Textile Sludge, Fly Ash, Chemical Effluent, Metal Slag, Plastic Scrap, Paper Pulp Waste, Organic Waste, E-Waste Dust, Packaging Offcuts, Pharma Sludge

CURRENT STATE:
- Swarm Active: ${clusterState.swarmActive}
- Total Factories: ${clusterState.factories.length}
- Total Matches: ${clusterState.matches.length}
- Total Products: ${clusterState.products.length}
- CO2 Avoided: ${clusterState.totalCo2Avoided} Tons
- Landfill Diverted: ${clusterState.totalLandfillDiverted} Tons
- Financial Value: ₹${clusterState.totalFinancialValue}

REGISTERED FACTORIES:
${factoryList}

TOP MATCHES:
${matchList}

PRODUCTS:
${productList}

Be concise, helpful, and professional. When asked about something, use the data above to give real answers.`;

  try {
    const result = await generateText({
      model: groq('llama-3.3-70b-versatile'),
      system: systemPrompt,
      messages,
    });

    let responseText = result.text;

    // Parse and execute REGISTER_FACTORY blocks
    const factoryRegex = /```REGISTER_FACTORY\s*([\s\S]*?)```/g;
    let match;
    while ((match = factoryRegex.exec(responseText)) !== null) {
      try {
        const data = JSON.parse(match[1].trim());
        const factory = engine.registerFactory({
          name: data.name,
          industryType: data.industryType,
          location: { lat: 17.385 + Math.random() * 0.5, lng: 78.486 + Math.random() * 0.5, address: data.address },
          productionCapacity: data.productionCapacity,
          rawMaterials: data.rawMaterials || [],
          declaredWastes: data.declaredWastes || [],
        });
        await persistFactory(factory);
        // Replace the JSON block with a success message
        responseText = responseText.replace(match[0], 
          `✅ **Factory "${factory.name}" registered successfully!** (ID: ${factory.id})\n` +
          `• ${factory.wasteStreams?.length ?? 0} waste streams created\n` +
          `• Matchmaking re-run — ${engine.getMatches().length} total matches now\n` +
          `• Refresh the Factories page to see it.`
        );
      } catch {
        responseText = responseText.replace(match[0], '❌ Failed to register factory — invalid data format.');
      }
    }

    return new Response(responseText, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("AI Chat Error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
