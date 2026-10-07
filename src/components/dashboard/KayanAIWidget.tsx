import React, { useState } from 'react';
import { 
  Sparkles, 
  TrendingUp, 
  BarChart2, 
  AlertTriangle, 
  ShieldCheck, 
  Lightbulb, 
  PieChart, 
  Paperclip, 
  Send,
  Bot,
  X
} from 'lucide-react';
import { quickPrompts } from '../../mock/dashboardData';
import { QuickPrompt } from '../../types/dashboard';

export const KayanAIWidget: React.FC = () => {
  const [inputValue, setInputValue] = useState('');
  const [activeResponse, setActiveResponse] = useState<string | null>(null);
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);

  const getPromptIcon = (iconType: QuickPrompt['icon']) => {
    switch (iconType) {
      case 'profit':
        return <TrendingUp size={15} className="text-blue-600" />;
      case 'expenses':
        return <BarChart2 size={15} className="text-emerald-600" />;
      case 'debt':
        return <AlertTriangle size={15} className="text-amber-600" />;
      case 'audit':
        return <ShieldCheck size={15} className="text-indigo-600" />;
      case 'optimize':
        return <Lightbulb size={15} className="text-yellow-600" />;
      case 'items':
        return <PieChart size={15} className="text-purple-600" />;
    }
  };

  const handleSelectPrompt = (prompt: QuickPrompt) => {
    setInputValue(prompt.text);
    setActiveQuestion(prompt.text);
    setIsThinking(true);
    setTimeout(() => {
      setIsThinking(false);
      setActiveResponse(prompt.response);
    }, 300);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    setActiveQuestion(inputValue);
    setIsThinking(true);
    setTimeout(() => {
      setIsThinking(false);
      // Find matching mock prompt or default smart response
      const matched = quickPrompts.find(p => p.text.includes(inputValue) || inputValue.includes(p.text));
      if (matched) {
        setActiveResponse(matched.response);
      } else {
        setActiveResponse(`بناءً على السجلات المحاسبية لشركة كيان سوفت، تظهر المؤشرات المالية استقراراً عاماً: إجمالي المبيعات بلغ 125.4M ريال وصافي الأرباح 51.2M ريال. هل تود استخراج كشف حساب مخصص لهذه العملية؟`);
      }
    }, 300);
  };

  return (
    <div className="bg-white rounded-2xl p-5 border border-purple-200/80 shadow-xs flex flex-col justify-between h-full relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-purple-100/40 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
              <Sparkles size={16} />
            </div>
            <h2 className="text-base font-extrabold text-purple-900">
              المساعد المحاسبي الذكي - Kayan AI
            </h2>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-700">
            مميز
          </span>
        </div>

        {/* Assistant Greeting Speech Bubble */}
        <div className="flex items-start gap-3 bg-purple-50/60 border border-purple-100 p-3 rounded-2xl mb-3.5">
          <div className="w-9 h-9 rounded-xl bg-linear-to-tr from-purple-700 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Bot size={20} />
          </div>
          <div className="text-right">
            <p className="text-xs font-bold text-slate-900 flex items-center gap-1">
              <span>مرحباً جهاد</span>
              <span>👋</span>
            </p>
            <p className="text-xs font-medium text-slate-600 mt-0.5 leading-relaxed">
              أنا Kayan AI. مستعد لمساعدتك في تحليل البيانات المالية والإجابة على أسئلتك.
            </p>
          </div>
        </div>

        {/* Display Active Response if opened */}
        {activeResponse && (
          <div className="mb-3 p-3 bg-purple-900 text-white rounded-xl text-xs relative animate-fade-in shadow-md">
            <button 
              onClick={() => setActiveResponse(null)}
              className="absolute top-2 left-2 text-purple-300 hover:text-white"
            >
              <X size={14} />
            </button>
            <p className="font-bold text-purple-200 mb-1">
              سؤال: {activeQuestion}
            </p>
            <p className="text-slate-100 leading-relaxed whitespace-pre-line text-[11px]">
              {isThinking ? 'جارٍ تحليل الدفاتر المحاسبية...' : activeResponse}
            </p>
          </div>
        )}

        {/* 6 Quick Prompt Buttons (Grid of 2 Columns) */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt.id}
              onClick={() => handleSelectPrompt(prompt)}
              className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 hover:bg-purple-50/80 border border-slate-200/70 hover:border-purple-300 text-right transition-all group"
            >
              <div className="p-1.5 rounded-lg bg-white shadow-2xs group-hover:scale-105 transition-transform shrink-0">
                {getPromptIcon(prompt.icon)}
              </div>
              <span className="text-[11px] font-semibold text-slate-700 group-hover:text-purple-900 leading-tight">
                {prompt.text}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Input Box */}
      <form onSubmit={handleSend} className="relative flex items-center gap-2 mt-1">
        <button
          type="button"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
          title="إرفاق ملف أو مستند"
        >
          <Paperclip size={17} />
        </button>

        <div className="relative flex-1">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="اكتب سؤالك هنا ..."
            className="w-full h-10 pr-4 pl-10 bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all text-right"
          />
        </div>

        <button
          type="submit"
          className="w-10 h-10 rounded-xl bg-purple-700 hover:bg-purple-800 text-white flex items-center justify-center shadow-md shadow-purple-700/20 transition-all duration-150 shrink-0"
          title="إرسال"
        >
          <Send size={16} className="-scale-x-100" />
        </button>
      </form>
    </div>
  );
};
