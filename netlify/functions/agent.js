const https = require('https');
const nodemailer = require('nodemailer');

const CONTEXT = "You are a PR agent for Richard Marriott, 53, distinguished silver male model, London. Silver hair, 5ft 11, chest 44\", suit 44R. Portfolio: https://richardmarriott-model.netlify.app. Email: rickmarriott569@gmail.com. Phone: +44 7535 602878. Already submitted to: MOT Models, Grey Models, Ugly Models, Models of Diversity, Sandra Reynolds, Select, Models 1, AMCK. When writing multiple emails separate each with ---EMAIL--- and format as:\nTO: email@address.com\nSUBJECT: subject\nBODY:\n[body]\n\nSign off: Best regards,\nRichard Marriott\nrickmarriott569@gmail.com\n+44 7535 602878\nPortfolio: https://richardmarriott-model.netlify.app";

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, headers, body: JSON.stringify({error: 'Invalid JSON'}) }; }

  if (body.action === 'checkEmail') {
    const ready = !!(process.env.GMAIL_USER && process.env.GMAIL_PASS);
    return { statusCode: 200, headers, body: JSON.stringify({ready, user: process.env.GMAIL_USER || null}) };
  }

  if (body.action === 'generate') {
    if (!process.env.ANTHROPIC_KEY) return { statusCode: 500, headers, body: JSON.stringify({error: 'ANTHROPIC_KEY not set in Netlify environment variables'}) };
    try {
      const text = await callClaude(body.prompt);
      return { statusCode: 200, headers, body: JSON.stringify({text}) };
    } catch(e) {
      return { statusCode: 500, headers, body: JSON.stringify({error: e.message}) };
    }
  }

  if (body.action === 'send') {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
      return { statusCode: 500, headers, body: JSON.stringify({error: 'Gmail not configured'}) };
    }
    const results = [];
    for (const email of (body.emails || [])) {
      try {
        await sendGmail(email.to, email.subject, email.body);
        results.push({to: email.to, success: true});
      } catch(e) {
        results.push({to: email.to, success: false, error: e.message});
      }
    }
    return { statusCode: 200, headers, body: JSON.stringify({results}) };
  }

  return { statusCode: 400, headers, body: JSON.stringify({error: 'Unknown action'}) };
};

function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: CONTEXT,
      messages: [{ role: 'user', content: prompt }]
    });
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', c => responseBody += c);
      res.on('end', () => {
        try {
          const p = JSON.parse(responseBody);
          if (p.content && p.content[0]) resolve(p.content[0].text);
          else reject(new Error(p.error ? p.error.message : 'No content returned'));
        } catch(e) { reject(new Error('Parse error: ' + responseBody.substring(0, 100))); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function sendGmail(to, subject, body) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS
    }
  });
  return transporter.sendMail({
    from: '"Richard Marriott" <' + process.env.GMAIL_USER + '>',
    to, subject, text: body
  });
}
