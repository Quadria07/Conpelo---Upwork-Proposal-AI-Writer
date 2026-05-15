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
          // Truncate to 5000 chars to avoid 413
          if (content.length > 5000) {
            content = content.substring(0, 5000) + "... [Truncated for size]";
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
PROPOSAL EXAMPLES:
1: ${kb.proposal1}
2: ${kb.proposal2}
3: ${kb.proposal3}

PROPOSAL HOOKS: ${kb.proposalHooks}
JOB RED FLAGS: ${kb.jobRedFlags}
NOTES FROM CLASS: ${kb.notesFromClass}
CLASS PROPOSAL EXAMPLES:
1: ${kb.classProposal1}
2: ${kb.classProposal2}

MY UPWORK PROFILE: ${kb.upworkProfile}
MY PORTFOLIO: ${kb.portfolio}
TONE GUIDE: ${kb.toneGuide}
PROJECTS AND LINKS: ${kb.projectsAndLinks}
[END KNOWLEDGE BASE]`;

    const systemPrompt = `You are Conpelo, an expert Upwork job evaluator and proposal writer. Follow the Knowledge Base and Instructions provided exactly.`;

    const analysisInstructions = `
ANALYSIS INSTRUCTIONS:
Evaluate the job against the Knowledge Base. Return only valid JSON.
Structure: {"decision":"APPLY"|"SKIP","confidence":"high"|"medium"|"low","reason":"3-4 sentences","greenFlags":[],"redFlags":[],"matchScore":0-100}`;

    const proposalInstructions = `
PROPOSAL WRITING RULES:
- No em dashes/semicolons
- No corporate jargon
- Reference portfolio and job details
- 150-220 words
- Unique to this job
`;

    const userContent = `${kbContent}\n\nJOB DESCRIPTION:\n${jobDescription}\n\n${phase === 'analyze' ? analysisInstructions : proposalInstructions}`;

    const payload = {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      temperature: 0.7,
    };

    if (phase === 'analyze') {
      payload.response_format = { type: 'json_object' };
    }

    const body = JSON.stringify(payload);
    const payloadSize = Buffer.byteLength(body);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { 
        statusCode: response.status, 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: `Groq API Error: ${response.status}`, 
          details: errorText,
          payloadSize: payloadSize,
          kbInfo: Object.keys(kb).map(k => `${k}(${kb[k].length})`).join(', ')
        }) 
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
      body: JSON.stringify({ error: `Function Error: ${error.message}` }) 
    };
  }
};
