export function renderHome(data, designSystem) {
  return `"use client";

import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="bg-[${designSystem.bgPrimary}] min-h-screen text-[${designSystem.textPrimary}]">
      {/* Navbar */}
      <header className="bg-[${designSystem.bgCard}] border-b border-[${designSystem.border}] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto py-5 px-6 flex justify-between items-center">
          <Link href="/" className="font-serif text-[${designSystem.textPrimary}] text-2xl tracking-wide">
            ${data.brandName || "LUXURY BRAND"}
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/" className="text-sm uppercase tracking-widest text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors">Home</Link>
            <Link href="/shop" className="text-sm uppercase tracking-widest text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors">Shop</Link>
            <Link href="/about" className="text-sm uppercase tracking-widest text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors">About</Link>
            <Link href="/contact" className="text-sm uppercase tracking-widest text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors">Contact</Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <motion.section 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
        className="relative h-[80vh] min-h-[600px] flex items-center justify-center overflow-hidden"
      >
        <Image 
          src="${data.hero.image}"
          alt="Hero" 
          fill={true} 
          sizes="100vw"
          className="object-cover opacity-80"
          priority
        />
        <div className="absolute inset-0 bg-black/20" />
        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <motion.h1 
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="font-serif text-5xl md:text-7xl lg:text-8xl text-white mb-6"
          >
            ${data.hero.title}
          </motion.h1>
          <motion.p 
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="text-lg md:text-xl text-white/90 mb-10 max-w-2xl mx-auto"
          >
            ${data.hero.subtitle}
          </motion.p>
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.8 }}
          >
            <Link href="/shop" className="inline-block bg-white text-black px-10 py-4 uppercase tracking-widest text-sm hover:bg-black hover:text-white transition-colors duration-300">
              ${data.hero.button || "Explore Collection"}
            </Link>
          </motion.div>
        </div>
      </motion.section>

      {/* Featured Products */}
      <section className="py-24 md:py-32 max-w-7xl mx-auto px-6">
        <div className="flex justify-between items-end mb-16">
          <h2 className="font-serif text-4xl md:text-5xl">Featured</h2>
          <Link href="/shop" className="text-sm uppercase tracking-widest text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors pb-1 border-b border-transparent hover:border-[${designSystem.textPrimary}]">
            View All
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          ${data.featured.map((item, i) => `
            <Link href="/shop" key="${i}" className="group cursor-pointer">
              <div className="relative aspect-[4/5] mb-6 overflow-hidden bg-[${designSystem.bgSecondary}]">
                <Image 
                  src="${item.image}"
                  alt="${item.name}"
                  fill={true} 
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover group-hover:scale-105 transition-transform duration-700 ease-out" 
                />
              </div>
              <div className="flex justify-between items-center">
                <h3 className="font-serif text-lg">${item.name}</h3>
                <p className="text-[${designSystem.textSecondary}]">${item.price}</p>
              </div>
            </Link>
          `).join('')}
        </div>
      </section>

      {/* Brand Story */}
      <section className="bg-[${designSystem.bgSecondary}] py-24 md:py-32">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-16 items-center">
          <div className="relative aspect-[3/4] w-full overflow-hidden">
            <Image 
              src="${data.brandStory.image}"
              alt="Brand Story" 
              fill={true} 
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
          <div>
            <h2 className="font-serif text-4xl md:text-5xl mb-8">${data.brandStory.heading}</h2>
            <p className="text-[${designSystem.textSecondary}] text-lg leading-relaxed mb-6">
              ${data.brandStory.paragraph1}
            </p>
            <p className="text-[${designSystem.textSecondary}] text-lg leading-relaxed mb-10">
              ${data.brandStory.paragraph2}
            </p>
            <Link href="/about" className="inline-block border border-[${designSystem.border}] px-8 py-3 uppercase tracking-widest text-sm hover:bg-[${designSystem.textPrimary}] hover:text-[${designSystem.bgPrimary}] transition-colors duration-300">
              Discover Our Story
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[${designSystem.bgCard}] py-20 border-t border-[${designSystem.border}] mt-auto">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="font-serif text-2xl mb-8">${data.brandName || "LUXURY BRAND"}</p>
          <div className="flex flex-wrap justify-center gap-8 mb-12">
            <Link href="/" className="text-sm text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors uppercase tracking-widest">Home</Link>
            <Link href="/shop" className="text-sm text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors uppercase tracking-widest">Shop</Link>
            <Link href="/about" className="text-sm text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors uppercase tracking-widest">About</Link>
            <Link href="/contact" className="text-sm text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors uppercase tracking-widest">Contact</Link>
          </div>
          <p className="text-[${designSystem.textSecondary}] text-xs">© 2026 ${data.brandName}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}`;
}

export function renderShop(data, designSystem) {
  return `"use client";

import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';

export default function ShopPage() {
  return (
    <div className="bg-[${designSystem.bgPrimary}] min-h-screen text-[${designSystem.textPrimary}] flex flex-col">
      {/* Navbar */}
      <header className="bg-[${designSystem.bgCard}] border-b border-[${designSystem.border}] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto py-5 px-6 flex justify-between items-center">
          <Link href="/" className="font-serif text-[${designSystem.textPrimary}] text-2xl tracking-wide">
            ${data.brandName || "LUXURY BRAND"}
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/" className="text-sm uppercase tracking-widest text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors">Home</Link>
            <Link href="/shop" className="text-sm uppercase tracking-widest text-[${designSystem.textPrimary}]">Shop</Link>
            <Link href="/about" className="text-sm uppercase tracking-widest text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors">About</Link>
            <Link href="/contact" className="text-sm uppercase tracking-widest text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors">Contact</Link>
          </nav>
        </div>
      </header>

      {/* Header */}
      <section className="pt-24 pb-16 px-6 text-center">
        <h1 className="font-serif text-5xl md:text-6xl mb-6">${data.header.title}</h1>
        <p className="text-[${designSystem.textSecondary}] text-lg max-w-2xl mx-auto">${data.header.subtitle}</p>
      </section>

      {/* Product Grid */}
      <section className="pb-24 md:pb-32 max-w-7xl mx-auto px-6 w-full flex-grow">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-16">
          ${data.products.map((item, i) => `
            <motion.div 
              key="${i}"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: ${i} * 0.1, duration: 0.6 }}
              className="group cursor-pointer"
            >
              <div className="relative aspect-[3/4] mb-6 overflow-hidden bg-[${designSystem.bgSecondary}]">
                <Image 
                  src="${item.image}"
                  alt="${item.name}"
                  fill={true} 
                  sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover group-hover:scale-105 transition-transform duration-700 ease-out" 
                />
              </div>
              <div className="flex flex-col items-center text-center">
                <h3 className="font-serif text-xl mb-2">${item.name}</h3>
                <p className="text-[${designSystem.textSecondary}] mb-4">${item.price}</p>
                <button className="border border-[${designSystem.border}] px-6 py-2 uppercase tracking-widest text-xs hover:bg-[${designSystem.textPrimary}] hover:text-[${designSystem.bgPrimary}] transition-colors duration-300">
                  Add to Cart
                </button>
              </div>
            </motion.div>
          `).join('')}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[${designSystem.bgCard}] py-20 border-t border-[${designSystem.border}] mt-auto">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="font-serif text-2xl mb-8">${data.brandName || "LUXURY BRAND"}</p>
          <div className="flex justify-center gap-8 mb-8">
            <Link href="/" className="text-sm text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors uppercase tracking-widest">Home</Link>
            <Link href="/shop" className="text-sm text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors uppercase tracking-widest">Shop</Link>
            <Link href="/about" className="text-sm text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors uppercase tracking-widest">About</Link>
            <Link href="/contact" className="text-sm text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors uppercase tracking-widest">Contact</Link>
          </div>
          <p className="text-[${designSystem.textSecondary}] text-xs">© 2026 ${data.brandName}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}`;
}

export function renderAbout(data, designSystem) {
  return `"use client";

import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';

export default function AboutPage() {
  return (
    <div className="bg-[${designSystem.bgPrimary}] min-h-screen text-[${designSystem.textPrimary}] flex flex-col">
      {/* Navbar */}
      <header className="bg-[${designSystem.bgCard}] border-b border-[${designSystem.border}] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto py-5 px-6 flex justify-between items-center">
          <Link href="/" className="font-serif text-[${designSystem.textPrimary}] text-2xl tracking-wide">
            ${data.brandName || "LUXURY BRAND"}
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/" className="text-sm uppercase tracking-widest text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors">Home</Link>
            <Link href="/shop" className="text-sm uppercase tracking-widest text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors">Shop</Link>
            <Link href="/about" className="text-sm uppercase tracking-widest text-[${designSystem.textPrimary}]">About</Link>
            <Link href="/contact" className="text-sm uppercase tracking-widest text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors">Contact</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="py-20 md:py-32"
      >
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="font-serif text-5xl md:text-7xl mb-6 text-balance">
            ${data.hero.title}
          </h1>
          <p className="text-[${designSystem.textSecondary}] text-lg md:text-xl">
            ${data.hero.subtitle}
          </p>
        </div>
      </motion.section>

      {/* Hero Image & Story */}
      <section className="pb-20 md:pb-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="relative aspect-video w-full mb-16 overflow-hidden">
            <Image 
              src="${data.hero.image}"
              alt="About Us" 
              fill={true} 
              sizes="100vw"
              className="object-cover" 
            />
          </div>
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-[${designSystem.textSecondary}] text-lg md:text-xl leading-relaxed">
              ${data.story}
            </p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="bg-[${designSystem.bgSecondary}] py-24 md:py-32 flex-grow">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-12">
            ${data.values.map((value, i) => `
              <motion.div
                key="${i}"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: ${i} * 0.15 }}
                className="text-center"
              >
                <h3 className="font-serif text-2xl mb-4">${value.title}</h3>
                <p className="text-[${designSystem.textSecondary}] leading-relaxed">${value.description}</p>
              </motion.div>
            `).join('')}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[${designSystem.bgCard}] py-20 border-t border-[${designSystem.border}] mt-auto">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="font-serif text-2xl mb-8">${data.brandName || "LUXURY BRAND"}</p>
          <div className="flex justify-center gap-8 mb-8">
            <Link href="/" className="text-sm text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors uppercase tracking-widest">Home</Link>
            <Link href="/shop" className="text-sm text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors uppercase tracking-widest">Shop</Link>
            <Link href="/about" className="text-sm text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors uppercase tracking-widest">About</Link>
            <Link href="/contact" className="text-sm text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors uppercase tracking-widest">Contact</Link>
          </div>
          <p className="text-[${designSystem.textSecondary}] text-xs">© 2026 ${data.brandName}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}`;
}

export function renderContact(data, designSystem) {
  return `"use client";

import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';

export default function ContactPage() {
  return (
    <div className="bg-[${designSystem.bgPrimary}] min-h-screen text-[${designSystem.textPrimary}] flex flex-col">
      {/* Navbar */}
      <header className="bg-[${designSystem.bgCard}] border-b border-[${designSystem.border}] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto py-5 px-6 flex justify-between items-center">
          <Link href="/" className="font-serif text-[${designSystem.textPrimary}] text-2xl tracking-wide">
            ${data.brandName || "LUXURY BRAND"}
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/" className="text-sm uppercase tracking-widest text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors">Home</Link>
            <Link href="/shop" className="text-sm uppercase tracking-widest text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors">Shop</Link>
            <Link href="/about" className="text-sm uppercase tracking-widest text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors">About</Link>
            <Link href="/contact" className="text-sm uppercase tracking-widest text-[${designSystem.textPrimary}]">Contact</Link>
          </nav>
        </div>
      </header>

      <section className="flex-grow py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-16">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="font-serif text-5xl md:text-6xl mb-6">${data.title}</h1>
            <p className="text-[${designSystem.textSecondary}] text-lg mb-12">${data.subtitle}</p>

            <div className="space-y-8 mb-12">
              <div>
                <h3 className="text-sm uppercase tracking-widest mb-2">Email</h3>
                <p className="font-serif text-2xl">${data.email}</p>
              </div>
              <div>
                <h3 className="text-sm uppercase tracking-widest mb-2">Phone</h3>
                <p className="font-serif text-2xl">${data.phone}</p>
              </div>
              <div>
                <h3 className="text-sm uppercase tracking-widest mb-2">Studio</h3>
                <p className="text-[${designSystem.textSecondary}] text-lg">${data.address}</p>
              </div>
            </div>
            
            <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
              <div>
                <input type="text" placeholder="Your Name" className="w-full bg-transparent border-b border-[${designSystem.border}] py-3 focus:outline-none focus:border-[${designSystem.textPrimary}] transition-colors" />
              </div>
              <div>
                <input type="email" placeholder="Your Email" className="w-full bg-transparent border-b border-[${designSystem.border}] py-3 focus:outline-none focus:border-[${designSystem.textPrimary}] transition-colors" />
              </div>
              <div>
                <textarea placeholder="Message" rows={4} className="w-full bg-transparent border-b border-[${designSystem.border}] py-3 focus:outline-none focus:border-[${designSystem.textPrimary}] transition-colors resize-none"></textarea>
              </div>
              <button className="w-full bg-[${designSystem.textPrimary}] text-[${designSystem.bgPrimary}] py-4 uppercase tracking-widest text-sm hover:opacity-90 transition-opacity">
                Send Message
              </button>
            </form>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative h-[600px] md:h-auto w-full bg-[${designSystem.bgSecondary}]"
          >
            <Image 
              src="${data.image}"
              alt="Contact Studio" 
              fill={true} 
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[${designSystem.bgCard}] py-20 border-t border-[${designSystem.border}] mt-auto">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="font-serif text-2xl mb-8">${data.brandName || "LUXURY BRAND"}</p>
          <div className="flex justify-center gap-8 mb-8">
            <Link href="/" className="text-sm text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors uppercase tracking-widest">Home</Link>
            <Link href="/shop" className="text-sm text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors uppercase tracking-widest">Shop</Link>
            <Link href="/about" className="text-sm text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors uppercase tracking-widest">About</Link>
            <Link href="/contact" className="text-sm text-[${designSystem.textSecondary}] hover:text-[${designSystem.textPrimary}] transition-colors uppercase tracking-widest">Contact</Link>
          </div>
          <p className="text-[${designSystem.textSecondary}] text-xs">© 2026 ${data.brandName}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}`;
}
