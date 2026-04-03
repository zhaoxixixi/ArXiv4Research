(() => {
  const ARA = (window.ARA = window.ARA || {});
  const paperDetail = (ARA.paperDetail = ARA.paperDetail || {});
  const { DEFAULT_RESEARCH_CONTEXT } = ARA.shared.constants;

  const stripCodeFence = (text = "") => {
    const value = text.trim();
    return value.startsWith("```") ? value.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim() : value;
  };

  const parseJsonOrNull = (text = "") => {
    try {
      return JSON.parse(stripCodeFence(text));
    } catch (_error) {
      return null;
    }
  };

  const requestLocalCompletion = async (settings, messages, temperature = 0.3) => {
    const response = await fetch(`${settings.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey}` },
      body: JSON.stringify({ model: settings.model, messages, temperature }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Request failed (${response.status})${text ? `: ${text.slice(0, 180)}` : ""}`);
    }
    const payload = await response.json();
    return (payload.choices?.[0]?.message?.content || "").trim();
  };

  const buildSparkPrompt = ({ paper, settings, aiSection }) => {
    const baseIdea = aiSection.idea_spark || {};
    const autoSummary = [
      aiSection.tldr ? `TL;DR: ${aiSection.tldr}` : "",
      aiSection.method ? `Method: ${aiSection.method}` : "",
      aiSection.result ? `Result: ${aiSection.result}` : "",
      baseIdea.idea ? `Auto Spark: ${baseIdea.idea}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    return [
      {
        role: "system",
        content:
          "你是一位 biology-first 的 AI4Science 研究助理。请结合用户研究背景和论文内容，给出更个性化、更可执行的 Spark。只返回严格 JSON，键为 fit, idea, experiments, risk, next_step。experiments 必须是字符串数组。",
      },
      {
        role: "user",
        content: `用户研究背景：\n${settings.researchContext || DEFAULT_RESEARCH_CONTEXT}\n\n论文标题：${paper.title}\n论文摘要：${paper.summary}\n领域：${paper.domain}\n自动日报摘要：\n${autoSummary || "暂无"}\n\n请输出更贴近我的 personalized spark。`,
      },
    ];
  };

  const buildFollowupPrompt = ({ paper, question, settings, aiSection, personalSparkText }) => [
    {
      role: "system",
      content: "你是 biology-first 研究助手。请结合论文、自动日报分析、用户研究背景与个性化 spark，给出简洁、可执行、实验导向的回答。请使用中文。",
    },
    {
      role: "user",
      content: `用户研究背景：\n${settings.researchContext || DEFAULT_RESEARCH_CONTEXT}\n\n论文标题：${paper.title}\n论文摘要：${paper.summary}\n自动日报 TL;DR：${aiSection.tldr || "暂无"}\n自动日报方法：${aiSection.method || "暂无"}\n自动日报结果：${aiSection.result || "暂无"}\n我的 Spark：\n${personalSparkText}\n\n问题：${question}`,
    },
  ];

  const formatPersonalSpark = (cache) => {
    const content = cache?.content || {};
    if (content.raw_response) return content.raw_response;
    const experiments = Array.isArray(content.experiments)
      ? content.experiments.map((item, index) => `${index + 1}. ${item}`).join("\n")
      : content.experiments || "";
    return [
      content.fit ? `Fit: ${content.fit}` : "",
      content.idea ? `Idea: ${content.idea}` : "",
      experiments ? `Suggested experiments:\n${experiments}` : "",
      content.risk ? `Risk: ${content.risk}` : "",
      content.next_step ? `Next step: ${content.next_step}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  };

  paperDetail.aiClient = {
    parseJsonOrNull,
    requestLocalCompletion,
    buildSparkPrompt,
    buildFollowupPrompt,
    formatPersonalSpark,
  };
})();
