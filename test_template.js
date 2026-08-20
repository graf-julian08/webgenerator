import { renderHome } from './templates.js';
const data = {
  hero: { title: "Hero", subtitle: "Sub", image: "img.jpg", button: "Btn" },
  brandStory: { heading: "Story", paragraph1: "p1", paragraph2: "p2", image: "img2.jpg" },
  featured: [{ name: "A", price: "$1", image: "a.jpg" }]
};
const ds = { bgPrimary: "#000", textPrimary: "#fff", bgCard: "#111", border: "#222", textSecondary: "#888", bgSecondary: "#333" };
console.log(renderHome(data, ds));
