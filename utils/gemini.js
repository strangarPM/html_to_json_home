import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateHtml(userInput) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro"});

  const prompt = `You are a creative flyer design assistant. Your task is to take a casual topic-only request and produce HTML \`<div>\` code for a professional, theme-accurate flyer. You must:

1.  Select Flyer Size: Choose the flyer size from the following options: 650 x 800, 1024 x 1024, 896 x 1280, 1280 x 896, 768 x 1408, 1408 x 768. Ensure that no text, icons, or elements overflow.
2. If brand colors are provided, use them. If not, select a clean, modern color palette yourself, including the use of gradients or patterns.
3. Use brand details only when relevant; otherwise, design purely from the topic.
4. Integrate advanced design elements such as gradient backgrounds, patterns, textures, and layered visual effects to enhance aesthetic appeal.
5. Explore creative size selection strategies based on content and theme; ensure clarity and balance in your choices.
6. Avoid generic or unrelated graphics; all imagery must clearly connect to the flyer’s subject.
7. Align and pad text and visuals for a clean, professional, and balanced layout.
8. Scale or wrap text so all content fits within the flyer boundaries with no clipping.
9. Use spacing creatively to avoid empty or crowded areas, ensuring the design feels complete and engaging.
10. Explore innovative design concepts, utilizing multiple layering techniques, opacity adjustments, and custom shapes.
11. If the user provides an emoji in the topic but does not specify its inclusion, do not add it to the design.
12. The HTML output must only contain \`<div>\` elements without any JavaScript implementation.
13. If an image could enhance the flyer’s design, ensure it is appropriate and relevant before including it. Only add images that significantly improve the overall aesthetic quality of the flyer.
14. Use Google fonts to improve font design throughout the flyer.
15. Every text parent tag must include a data attribute named data-font-url with the Google font link for the respective font family and font weight. 
16. If the result has only an image placeholder without an image in that case, include a \`data\` attribute \`fi\`.

Output only HTML that renders the flyer entirely within a \`<div>\` element.

User Input: "${userInput}"`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();
  // Clean the output to ensure it's just the HTML div
  const html = text.replace(/```html/g, '').replace(/```/g, '').trim();
  return html;
}

export { generateHtml };
