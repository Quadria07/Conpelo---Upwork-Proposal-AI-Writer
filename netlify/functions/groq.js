import fs from 'fs';
import path from 'path';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { jobDescription, phase } = JSON.parse(event.body);
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Server configuration error: API key missing.' })
      };
    }

    const dataDir = path.resolve(__dirname, 'data');
    
    const readKB = (file) => {
      try {
        const filePath = path.join(dataDir, `${file}.txt`);
        if (fs.existsSync(filePath)) {
          let content = fs.readFileSync(filePath, 'utf8');
          // Keep it around 4000 chars - safe and smart
          if (content.length > 4000) {
            content = content.substring(0, 4000);
          }
          return content;
        }
        return "";
      } catch (e) {
        return "";
      }
    };

    const kb = {
      proposal1: readKB('proposal1'),
      proposal2: readKB('proposal2'),
      proposal3: readKB('proposal3'),
      proposalHooks: readKB('proposalHooks'),
      jobRedFlags: readKB('jobRedFlags'),
      notesFromClass: readKB('notesFromClass'),
      classProposal1: readKB('classProposal1'),
      classProposal2: readKB('classProposal2'),
      upworkProfile: readKB('upworkProfile'),
      portfolio: readKB('portfolio'),
      toneGuide: readKB('toneGuide'),
      projectsAndLinks: readKB('projectsAndLinks')
    };

    const kbContent = `[KNOWLEDGE BASE]
PROPOSAL EXAMPLES: ${kb.proposal1}\n${kb.proposal2}\n${kb.proposal3}
PROPOSAL HOOKS: ${kb.proposalHooks}
JOB RED FLAGS: ${kb.jobRedFlags}
NOTES FROM CLASS: ${kb.notesFromClass}
CLASS PROPOSAL EXAMPLES: ${kb.classProposal1}\n${kb.classProposal2}
MY UPWORK PROFILE: ${kb.upworkProfile}
MY PORTFOLIO: ${kb.portfolio}
TONE GUIDE: ${kb.toneGuide}
PROJECTS AND LINKS: ${kb.projectsAndLinks}
[END KNOWLEDGE BASE]`;

    const systemPrompt = `You are Conpelo, an expert Upwork assistant. Follow the Knowledge Base and Instructions exactly.`;

    const analysisInstructions = `
ANALYSIS INSTRUCTIONS:
Evaluate against Knowledge Base. Return valid JSON only.
Structure: {"decision":"APPLY"|"SKIP","confidence":"high"|"medium"|"low","reason":"3-4 sentences","greenFlags":[],"redFlags":[],"matchScore":0-100}`;

    const proposalInstructions = `
PROPOSAL WRITING RULES:
- No em dashes or semicolons
- No corporate jargon
- Reference portfolio and job details
- 150 to 220 words maximum
- Unique to this job
`;

    const userContent = `${kbContent}\n\nJOB DESCRIPTION:\n${jobDescription}\n\n${phase === 'analyze' ? analysisInstructions : proposalInstructions}`;

    // STRATEGY: Use 8B for fast, cheap analysis to save 70B rate limits for the actual proposal.
    const model = phase === 'analyze' ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile';

    const payload = {
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      temperature: 0.7,
    };

    if (phase === 'analyze') {
      payload.response_format = { type: 'json_object' };
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = `Groq Error: ${response.status}`;
      if (response.status === 429) {
        errorMsg = "Slow down! Groq rate limit reached. Please wait 30 seconds and try again.";
      }
      
      return { 
        statusCode: response.status, 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: errorMsg, status: response.status }) 
      };
    }

    const data = await response.json();
    
    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' 
      },
      body: JSON.stringify(data),
    };

  } catch (error) {
    return { 
      statusCode: 500, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Server Error: ${error.message}` }) 
    };
  }
};
