export function ComponentLibrary() {
    return {
        name: "AI Website Builder Component Library",
        description: "A library of high-end components for luxury e-commerce websites",
        version: "1.0.0",
        components: {
            hero: {
                count: 15,
                description: "Full-screen hero sections for landing pages"
            },
            navbar: {
                count: 15,
                description: "Navigation components with various styles"
            },
            productGrid: {
                count: 12,
                description: "Product grid layouts for e-commerce"
            },
            story: {
                count: 11,
                description: "Content sections for brand storytelling"
            },
            footer: {
                count: 14,
                description: "Footer components for site completion"
            }
        }
    };
}

export default ComponentLibrary;