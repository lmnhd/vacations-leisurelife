"use client";

import { Card, CardContent, CardTitle } from "./ui/card";

const testimonials = [
  {
    name: "John Doe",
    title: "Vacation expert",
    avatar: "J",
    quote:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed ac orci quis tortor imperdiet venenatis.",
  },
  {
    name: "John Doe",
    title: "Vacation expert",
    avatar: "J",
    quote:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed ac orci quis tortor imperdiet venenatis.",
  },
  {
    name: "John Doe",
    title: "Vacation expert",
    avatar: "J",
    quote:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed ac orci quis tortor imperdiet venenatis.",
  },
 
];

export const LandingContent = () => {
  return (
    <div className="px-10 pb-20">
      <h2 className="mb-10 text-4xl font-extrabold text-center text-white">
        Testimonials
      </h2>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {testimonials.map((testimonial) => (
          <Card key={testimonial.name} className="bg-[#192339] border-none text-white">
            <CardTitle className="flex items-center gap-x-2">
              <div>
                <p className="text-lg">{testimonial.name}</p>
                <p className="text-sm text-zinc-400">{testimonial.title}</p>
              </div>
            </CardTitle>
            <CardContent className="px-0 pt-4">
                {testimonial.quote}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
