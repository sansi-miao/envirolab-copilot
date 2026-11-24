import { useState, type FormEvent } from "react";
import { ArrowRight, BookOpen, FlaskConical, Info, LineChart } from "lucide-react";

const exampleQuestion = "活性炭投加量对水中 COD 去除率的影响";

const quickLinks = [
  { label: "文献发现", href: "#/discover", icon: BookOpen },
  { label: "实验搜索", href: "#/experiments", icon: FlaskConical },
  { label: "数据分析", href: "#/analysis", icon: LineChart },
];

export function QuestionComposer({ onSubmit }: { onSubmit: (question: string) => void }) {
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) {
      setError("请先输入一个研究问题");
      return;
    }
    onSubmit(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="research-composer">
      <div className="composer-head">
        <label htmlFor="research-question" className="composer-label">研究问题或检索草稿</label>
        <span className="composer-count" aria-hidden="true">{question.length} / 200</span>
      </div>
      <textarea
        id="research-question"
        value={question}
        onChange={(event) => {
          setQuestion(event.target.value);
          if (error) setError("");
        }}
        maxLength={200}
        rows={3}
        placeholder="例如：活性炭投加量对水中 COD 去除率的影响"
        aria-describedby={`question-privacy${error ? " question-error" : ""}`}
        className="composer-textarea"
      />
      {error && <p id="question-error" role="alert" className="composer-error">{error}</p>}

      <div className="composer-footer">
        <div className="quick-links" aria-label="快捷入口">
          {quickLinks.map((link) => {
            const Icon = link.icon;
            return (
              <a key={link.label} href={link.href} className="quick-link">
                <Icon size={13} strokeWidth={1.5} aria-hidden="true" />
                {link.label}
              </a>
            );
          })}
        </div>
        <div className="composer-actions">
          <button
            type="button"
            onClick={() => {
              setQuestion(exampleQuestion);
              setError("");
            }}
            className="button button--quiet button--small"
          >
            使用示例
          </button>
          <button type="submit" className="button button--primary">
            进入文献发现
            <ArrowRight size={15} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      </div>
      <p id="question-privacy" className="composer-note">
        <Info size={12} strokeWidth={1.5} className="mt-px shrink-0" aria-hidden="true" />
        问题只留在当前页面内存，不写入 URL 或浏览器存储；进入发现页后点击“搜索文献”才会发送关键词。
      </p>
    </form>
  );
}