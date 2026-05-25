function testRun() {
  const today = new Date();
  const oneMonthAgo = new Date(today);
  oneMonthAgo.setDate(today.getDate() - 30);

  const dateLabel = formatDate(today);
  const periodLabel = formatDate(oneMonthAgo) + '〜' + formatDate(today);

  const categories = [
    { label: '企業ニュース', query: 'label:news-company' },
    { label: 'AI動向',      query: 'label:news-AI' },
    { label: '論文',        query: 'label:news-paper' },
  ];

  categories.forEach((category, index) => {
    if (index > 0) Utilities.sleep(10000);

    const emails = fetchEmails(category.query, oneMonthAgo);
    console.log(`${category.label}：${emails.length}件取得`);

    if (emails.length === 0) {
      console.log('メールなし、スキップします');
      return;
    }

    const summary = summarizeWithGemini(emails, category.label);
    console.log(`要約完了：${summary.slice(0, 100)}...`);

    const compressed = compressSummary(summary);
    console.log(`圧縮要約完了：${compressed}`);

    const blocks = buildNotionBlocks(summary, emails);
    console.log(`ブロック数：${blocks.length}`);

    saveToNotion(dateLabel, periodLabel, category.label, blocks, compressed, emails.length);
    console.log(`Notionに保存完了`);
  });
}