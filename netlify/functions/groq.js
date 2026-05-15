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

    // Load Knowledge Base from local files
    // In Netlify, included_files are usually relative to the project root or the function
    // We'll try to find them in the data folder we created
    const dataDir = path.join(process.cwd(), 'netlify', 'functions', 'data');
    
    const readKB = (file) => {
      try {
        return fs.readFileSync(path.join(dataDir, `${file}.txt`), 'utf8');
      } catch (e) {
        console.error(`Error reading ${file}.txt:`, e.message);
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

    const systemPrompt = `You are Conpelo, an expert Upwork job evaluator and proposal writer working exclusively for one specific freelancer. Your only job is to help them win on Upwork.

Read every section below before doing anything. This is the only truth you work from. Every decision and every word must come from what is written here. Do not add assumptions or outside knowledge.

[KNOWLEDGE BASE]

PROPOSAL EXAMPLES:
Example 1: ${kb.proposal1}
Example 2: ${kb.proposal2}
Example 3: ${kb.proposal3}

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
[END KNOWLEDGE BASE]
`;

    const analysisInstructions = `
ANALYSIS INSTRUCTIONS:
Evaluate the job honestly against everything above. Check skill match, budget fit, client signals, red flags, and opportunity quality. Return only valid JSON with no markdown and no text outside the JSON object.
Structure:
{
  "decision": "APPLY" or "SKIP",
  "confidence": "high", "medium", or "low",
  "reason": "3 to 4 plain sentences explaining the decision",
  "greenFlags": ["positive signal"],
  "redFlags": ["warning sign"],
  "matchScore": number (0-100)
}`;

    const proposalInstructions = `
PROPOSAL WRITING RULES — NON-NEGOTIABLE:
- No em dashes anywhere
- No semicolons
- Never use: "I hope this finds you well", "I am reaching out", "leverage", "deliverables", "passionate about", "synergy", "going forward", "look no further", "I would love the opportunity", "I am confident that", "as per your requirements", "touch base", "circle back"
- Do not start with the word "I"
- No bullet points in the proposal body
- No generic openers
- No formal closing lines
- Open with something pulled directly from their specific job post
- Reference one real project from the portfolio that fits their need
- End with one natural conversational question or soft next step
- 150 to 220 words maximum
- Write like a confident human emailing someone, not a cover letter
- Every proposal must be completely unique to that exact job
`;

    const finalSystemPrompt = systemPrompt + (phase === 'analyze' ? analysisInstructions : proposalInstructions);

    const payload = {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: finalSystemPrompt },
        { role: 'user', content: jobDescription }
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
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { 
        statusCode: response.status, 
        body: JSON.stringify({ error: `Groq API Error: ${response.status}`, details: errorText }) 
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
    console.error("Function Error:", error);
    return { 
      statusCode: 500, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: "Internal server error." }) 
    };
  }
};
