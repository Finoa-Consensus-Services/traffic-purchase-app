"use client";

import { useState } from "react";

type FaqItem = { question: string; answer: string };

type FaqAccordionProps = {
  items: readonly FaqItem[];
};

export const FaqAccordion = ({ items }: FaqAccordionProps) => {
  const [openIndex, setOpenIndex] = useState(0);

  const handleSummaryClick = (index: number) => {
    setOpenIndex((current) => (current === index ? -1 : index));
  };

  return (
    <section className="mt-6" aria-label="Questions">
      {items.map((item, index) => (
        <details
          key={item.question}
          open={openIndex === index}
          className={index === items.length - 1 ? "border-y border-line" : "border-t border-line"}
        >
          <summary
            className="flex min-h-12 cursor-pointer items-center font-bold tracking-tight"
            aria-expanded={openIndex === index}
            onClick={(event) => {
              event.preventDefault();
              handleSummaryClick(index);
            }}
          >
            {item.question}
          </summary>
          <p className="pb-4 text-ink-muted">{item.answer}</p>
        </details>
      ))}
    </section>
  );
};