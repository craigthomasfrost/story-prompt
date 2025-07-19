const fs = require('fs');
const path = require('path');
const axios = require('axios');
const dayjs = require('dayjs');

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

const postsDir = path.join(process.cwd(), '_posts');

// Ensure _posts/ directory exists
if (!fs.existsSync(postsDir)) {
  fs.mkdirSync(postsDir, { recursive: true });
}

// Read previous 30 posts to avoid duplicates
const readPreviousPrompts = () => {
  if (!fs.existsSync(postsDir)) return [];
  return fs.readdirSync(postsDir)
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse()
    .slice(0, 30)
    .map(filename => {
      const content = fs.readFileSync(path.join(postsDir, filename), 'utf8');
      const titleMatch = content.match(/^title:\s*"(.*?)"/m);
      const body = content.split('---\n').pop().trim();
      return {
        title: titleMatch ? titleMatch[1] : '',
        description: body
      };
    });
};

const previousPrompts = readPreviousPrompts();
const promptList = previousPrompts.map(p => `• **${p.title}** — ${p.description}`).join('\n');

// Generate new prompt with OpenAI
(async () => {
  const response = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: 'gpt-4o',
    tools: [toolDefinition],
    tool_choice: {
      type: 'function',
      function: { name: 'generate_story_prompt' }
    },
    messages: [
      {
        role: 'system',
        content: 'You are a storytelling coach who writes daily Moth-style story prompts.'
      },
      {
        role: 'user',
        content: `Here are the 30 most recent daily story prompts:\n\n${promptList}\n\nPlease generate a new one that is clearly different.`
      }
    ]
  }, {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    }
  });

  const toolCall = response.data.choices[0].message.tool_calls?.[0];
  const { title, description } = JSON.parse(toolCall.function.arguments);

  // Save as markdown file
  const date = dayjs().format('YYYY-MM-DD');
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const filename = path.join(postsDir, `${date}-${slug}.md`);
  const markdown = `---\ntitle: "${title}"\ndate: ${date}\nlayout: post\n---\n\n${description}\n`;

  fs.writeFileSync(filename, markdown, 'utf8');
  console.log(`Prompt written to ${filename}`);
})();
