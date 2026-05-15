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
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Server configuration error: Gemini API key missing.' })
      };
    }

    const dataDir = path.resolve(__dirname, 'data');
    
    const readKB = (file) => {
      try {
        const filePath = path.join(dataDir, `${file}.txt`);
        if (fs.existsSync(filePath)) {
          // NO MORE TRUNCATION - Gemini can handle it!
          return fs.readFileSync(filePath, 'utf8');
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

    const systemPrompt = `You are Conpelo, an expert Upwork job evaluator and proposal writer. Your only job is to help the freelancer win. Use the provided Knowledge Base exactly.`;

    const analysisInstructions = `
ANALYSIS INSTRUCTIONS:
Evaluate the job against the Knowledge Base. Return only valid JSON.
Structure:
{
  "decision": "APPLY" or "SKIP",
  "confidence": "high", "medium", or "low",
  "reason": "3-4 sentences",
  "greenFlags": ["positive signals"],
  "redFlags": ["warning signs"],
  "matchScore": number (0-100)
}`;

    const proposalInstructions = `
PROPOSAL WRITING RULES:
- No em dashes, no semicolons.
- No corporate jargon (leverage, deliverables, synergy, etc.).
- Do not start with "I".
- Reference a specific project from the portfolio.
- End with a natural question.
- 150-220 words.
- Unique to this job.
`;

    const fullPrompt = `${systemPrompt}\n\n${kbContent}\n\nJOB DESCRIPTION:\n${jobDescription}\n\n${phase === 'analyze' ? analysisInstructions : proposalInstructions}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 2048,
      }
    };

    if (phase === 'analyze') {
      payload.generationConfig.responseMimeType = "application/json";
    }

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { 
        statusCode: response.status, 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Gemini API Error: ${response.status}`, details: errorText }) 
      };
    }

    const data = await response.json();
    const content = data.candidates[0].content.parts[0].text;
    
    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' 
      },
      body: JSON.stringify({ content }),
    };

  } catch (error) {
    return { 
      statusCode: 500, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Server Error: ${error.message}` }) 
    };
  }
};
