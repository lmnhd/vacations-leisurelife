import React from "react";

interface ValuePropItem {
  icon: string;
  title: string;
  description: string;
}

const VALUE_PROPS: ValuePropItem[] = [
  {
    icon: "🏆",
    title: "Expert Advisors",
    description: "Personalized cruise planning from specialists who've sailed the world.",
  },
  {
    icon: "💰",
    title: "Best Price Match",
    description: "Found a lower price? We'll match it — guaranteed.",
  },
  {
    icon: "🎭",
    title: "Themed Cruises",
    description: "Music, food, lifestyle, and culture events at sea.",
  },
  {
    icon: "👥",
    title: "Group Travel",
    description: "Specialists for groups of 10 to 500+ — corporate, social, and more.",
  },
];

export function LandingValueProps() {
  return (
    <section className="bg-gradient-to-b from-white to-gray-50 py-12 px-6 border-b border-gray-100">
      <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
        {VALUE_PROPS.map((item) => (
          <div
            key={item.title}
            className="flex flex-col items-center text-center gap-3"
          >
            <span className="text-4xl" aria-hidden="true">
              {item.icon}
            </span>
            <h3 className="text-sm md:text-base font-bold text-primary uppercase tracking-wide">
              {item.title}
            </h3>
            <p className="text-xs md:text-sm text-gray-500 leading-relaxed">
              {item.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
