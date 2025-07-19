const fs = require('fs');
const path = require('path');
const axios = require('axios');
const dayjs = require('dayjs');
const matter = require('gray-matter');

const postsDir = path.join(process.cwd(), '_posts');

// Ensure _posts/ directory exists
if (!fs.existsSync(postsDir)) {
  fs.mkdirSync(postsDir, { recursive: true });
}

// Load recent prompts (title + description) using gray-matter
const readPreviousPrompts = () => {
  return fs.readdirSync(postsDir)
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse()
    .slice(0, 30)
    .map(filename => {
      const file = fs.readFileSync(path.join(postsDir, filename), 'utf8');
      const parsed = matter(file);
      return {
        title: parsed.data?.title || '',
        description: parsed.content.trim()
      };
    });
};

const previousPrompts = readPreviousPrompts();
const titleList = previousPrompts
  .map(p => `• **${p.title}** — ${p.description}`)
  .join('\n');

// Define OpenAI tool (Zod-style schema)
const toolDefinition = {
  type: 'function',
  function: {
    name: 'generate_story_prompt',
    description: 'Generate a Moth-style daily story prompt',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Short, compelling theme (e.g., "The Last Time")'
        },
        description: {
          type: 'string',
          description: 'One or two sentence setup like The Moth uses'
        }
      },
      required: ['title', 'description']
    }
  }
};

// Generate prompt from OpenAI
(async () => {
  const response = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: 'gpt-4o',
    tools: [toolDefinition],
    tool_choice: { type: 'function', function: { name: 'generate_story_prompt' } },
    messages: [
      {
        role: 'system',
        content: 'You are a storytelling coach who writes daily Moth-style story prompts.'
      },
      {
        role: 'user',
        content: `Here are the 30 most recent prompts:\n\n${titleList}\n\nPlease generate a new one that is clearly different.`
      }
    ]
  }, {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    }
  });

  // Extract and format the result
  const toolCall = response.data.choices[0].message.tool_calls?.[0];
  const { title, description } = JSON.parse(toolCall.function.arguments);

  const date = dayjs().format('YYYY-MM-DD');
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const filePath = path.join(postsDir, `${date}-${slug}.md`);

  const markdown = `---\ntitle: "${title}"\ndate: ${date}\nlayout: post\n---\n\n${description}\n`;

  fs.writeFileSync(filePath, markdown, 'utf8');
  console.log(`Prompt written to ${filePath}`);
})();
