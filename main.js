// ===== 設定 =====
const NOTION_TOKEN = PropertiesService.getScriptProperties().getProperty('NOTION_TOKEN');
const GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
const NOTION_DATABASE_ID = PropertiesService.getScriptProperties().getProperty('NOTION_DATABASE_ID');

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';
const NOTION_HEADERS = {
  'Authorization': 'Bearer ' + NOTION_TOKEN,
  'Notion-Version': '2022-06-28',
};

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
    thread.getMessages().forEach(message => {
      if (message.getDate() < since) return;

      const body = message.getPlainBody();
      const urlMatch = body.match(/https?:\/\/[^\s\]\)>]+/);

      emails.push({
        subject: message.getSubject(),
        body: body.slice(0, 1000),
        url: urlMatch ? urlMatch[0] : null,
      });
    });
  });

  return emails;
}

// ===== Gemini API呼び出し =====
function callGemini(prompt) {
  const response = UrlFetchApp.fetch(
    GEMINI_ENDPOINT + '?key=' + GEMINI_API_KEY,
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

// ===== Gemini APIで要約 =====
function summarizeWithGemini(emails, category) {
  const emailText = emails.map((e, i) =>
    `【${i + 1}】${e.subject}\n${e.body}`
  ).join('\n\n---\n\n');

  return callGemini(`
以下は「${category}」に関する1週間分のメール内容です。
重要なニュースを3〜5点に絞り、日本語で簡潔に要約してください。
各ニュースは以下の形式で出力してください。

- ニュースの要約文

余計な前置きや後書きは不要です。箇条書きのみ出力してください。

${emailText}
  `);
}

// ===== 要約カラム用にさらに短く圧縮 =====
function compressSummary(summary) {
  return callGemini(`
以下の箇条書きを2〜3文の短い文章にまとめてください。
箇条書きや記号は使わず、自然な日本語の文章にしてください。

${summary}
  `);
}

// ===== NotionブロックをGemini要約＋リンクから生成 =====
function buildNotionBlocks(summary, emails) {
  const blocks = [];

  summary.split('\n')
    .map(line => line.replace(/^[•\-\*]\s*/, '').trim())
    .filter(text => text)
    .forEach(text => blocks.push(makeBulletBlock(text)));

  blocks.push({ object: 'block', type: 'divider', divider: {} });

  blocks.push({
    object: 'block',
    type: 'heading_3',
    heading_3: { rich_text: [{ type: 'text', text: { content: '📎 元記事' } }] }
  });

  emails.forEach(email => blocks.push(makeBulletBlock(email.subject, email.url)));

  return blocks;
}

function makeBulletBlock(text, url) {
  const richText = url
    ? [{ type: 'text', text: { content: text, link: { url } } }]
    : [{ type: 'text', text: { content: text } }];

  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: { rich_text: richText }
  };
}

// ===== Notionにページを作成 =====
function saveToNotion(dateLabel, periodLabel, label, blocks, summary, emailCount) {
  const payload = {
    parent: { database_id: NOTION_DATABASE_ID },
    properties: {
      '名前':     { title: [{ text: { content: '週次まとめ ' + dateLabel } }] },
      '期間':     { rich_text: [{ text: { content: periodLabel } }] },
      'ラベル':   { multi_select: [{ name: label }] },
      '要約':     { rich_text: [{ text: { content: summary } }] },
      'メール件数': { number: emailCount },
    },
    children: blocks.slice(0, 100)
  };

  const response = UrlFetchApp.fetch('https://api.notion.com/v1/pages', {
    method: 'post',
    contentType: 'application/json',
    headers: NOTION_HEADERS,
    payload: JSON.stringify(payload)
  });

  const pageId = JSON.parse(response.getContentText()).id;

  if (blocks.length > 100) {
    appendBlocksToPage(pageId, blocks.slice(100));
  }
}

// ===== ページにブロックを追加 =====
function appendBlocksToPage(pageId, blocks) {
  for (let i = 0; i < blocks.length; i += 100) {
    UrlFetchApp.fetch('https://api.notion.com/v1/blocks/' + pageId + '/children', {
      method: 'patch',
      contentType: 'application/json',
      headers: NOTION_HEADERS,
      payload: JSON.stringify({ children: blocks.slice(i, i + 100) })
    });
    Utilities.sleep(500);
  }
}

// ===== 日付フォーマット =====
function formatDate(date) {
  return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy/MM/dd');
}
