// ===== 設定 =====
const NOTION_TOKEN = PropertiesService.getScriptProperties().getProperty('NOTION_TOKEN');
const GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
const NOTION_DATABASE_ID = PropertiesService.getScriptProperties().getProperty('NOTION_DATABASE_ID');

// ===== メイン関数（毎週土曜に自動実行） =====
function weeklyNewsSummary() {
  const today = new Date();
  const oneWeekAgo = new Date(today);
  oneWeekAgo.setDate(today.getDate() - 7);

  const dateLabel = formatDate(today);
  const periodLabel = formatDate(oneWeekAgo) + '〜' + formatDate(today);

  const categories = [
    { label: '企業ニュース', query: 'label:news-company' },
    { label: 'AI動向',      query: 'label:news-AI' },
    { label: '論文',        query: 'label:news-paper' },
  ];

  categories.forEach((category, index) => {
    if (index > 0) Utilities.sleep(10000);

    const emails = fetchEmails(category.query, oneWeekAgo);
    if (emails.length === 0) return;

    const summary = summarizeWithGemini(emails, category.label);
    const compressed = compressSummary(summary);
    const blocks = buildNotionBlocks(summary, emails);
    saveToNotion(dateLabel, periodLabel, category.label, blocks, compressed, emails.length);
  });
}

// ===== Gmailからメールを取得 =====
function fetchEmails(query, since) {
  const threads = GmailApp.search(query, 0, 50);
  const emails = [];

  threads.forEach(thread => {
    const messages = thread.getMessages();
    messages.forEach(message => {
      if (message.getDate() >= since) {
        const body = message.getPlainBody();

        // メール本文からURLを抽出
        const urlMatch = body.match(/https?:\/\/[^\s\]\)>]+/);
        const url = urlMatch ? urlMatch[0] : null;

        emails.push({
          subject: message.getSubject(),
          body: body.slice(0, 1000),
          url: url,
        });
      }
    });
  });

  return emails;
}

// ===== Gemini APIで要約 =====
function summarizeWithGemini(emails, category) {
  const emailText = emails.map((e, i) =>
    `【${i + 1}】${e.subject}\n${e.body}`
  ).join('\n\n---\n\n');

  const prompt = `
以下は「${category}」に関する1週間分のメール内容です。
重要なニュースを3〜5点に絞り、日本語で簡潔に要約してください。
各ニュースは以下の形式で出力してください。

- ニュースの要約文

余計な前置きや後書きは不要です。箇条書きのみ出力してください。

${emailText}
  `;

  const response = UrlFetchApp.fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    }
  );

  const responseText = response.getContentText();
  const result = JSON.parse(responseText);

  if (result.error) {
    throw new Error('Gemini APIエラー：' + result.error.message);
  }

  return result.candidates[0].content.parts[0].text;
}

// ===== 要約カラム用にさらに短く圧縮 =====
function compressSummary(summary) {
  const prompt = `
以下の箇条書きを2〜3文の短い文章にまとめてください。
箇条書きや記号は使わず、自然な日本語の文章にしてください。

${summary}
  `;

  const response = UrlFetchApp.fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    }
  );

  const result = JSON.parse(response.getContentText());
  if (result.error) throw new Error('Gemini APIエラー：' + result.error.message);
  return result.candidates[0].content.parts[0].text;
}

// ===== NotionブロックをGemini要約＋リンクから生成 =====
function buildNotionBlocks(summary, emails) {
  const blocks = [];

  // 要約をNotionの箇条書きブロックに変換
  const lines = summary.split('\n').filter(line => line.trim() !== '');
  lines.forEach(line => {
    const text = line.replace(/^[•\-\*]\s*/, '').trim();
    if (text) {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{ type: 'text', text: { content: text } }]
        }
      });
    }
  });

  // 区切り線
  blocks.push({ object: 'block', type: 'divider', divider: {} });

  // 元記事リンク一覧
  blocks.push({
    object: 'block',
    type: 'heading_3',
    heading_3: {
      rich_text: [{ type: 'text', text: { content: '📎 元記事' } }]
    }
  });

  emails.forEach(email => {
    if (email.url) {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{
            type: 'text',
            text: { content: email.subject, link: { url: email.url } }
          }]
        }
      });
    } else {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{ type: 'text', text: { content: email.subject } }]
        }
      });
    }
  });

  return blocks;
}

// ===== Notionにページを作成 =====
function saveToNotion(dateLabel, periodLabel, label, blocks, summary, emailCount) {
  const url = 'https://api.notion.com/v1/pages';

  const firstBlocks = blocks.slice(0, 100);

  const payload = {
    parent: { database_id: NOTION_DATABASE_ID },
    properties: {
      '名前': {
        title: [{ text: { content: `週次まとめ ${dateLabel}` } }]
      },
      '期間': {
        rich_text: [{ text: { content: periodLabel } }]
      },
      'ラベル': {
        multi_select: [{ name: label }]
      },
      '要約': {
        rich_text: [{ text: { content: summary } }]
      },
      'メール件数': {
        number: emailCount
      },
    },
    children: firstBlocks
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
    },
    payload: JSON.stringify(payload)
  });

  const pageId = JSON.parse(response.getContentText()).id;

  if (blocks.length > 100) {
    const remainingBlocks = blocks.slice(100);
    appendBlocksToPage(pageId, remainingBlocks);
  }
}

// ===== ページにブロックを追加 =====
function appendBlocksToPage(pageId, blocks) {
  const chunkSize = 100;
  for (let i = 0; i < blocks.length; i += chunkSize) {
    const chunk = blocks.slice(i, i + chunkSize);
    UrlFetchApp.fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
      method: 'patch',
      contentType: 'application/json',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
      },
      payload: JSON.stringify({ children: chunk })
    });
    Utilities.sleep(500);
  }
}

// ===== 日付フォーマット =====
function formatDate(date) {
  return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy/MM/dd');
}