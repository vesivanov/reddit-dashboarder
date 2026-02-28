# Landing Page Copy — Ready to Implement

Use this copy to create a banner at the top of index.html or a separate landing page.

---

## Hero Section (Above the Dashboard)

```html
<div class="hero-banner bg-gradient-to-r from-blue-600 to-purple-600 text-white py-12 px-6">
  <div class="max-w-4xl mx-auto text-center">
    <h1 class="text-4xl md:text-5xl font-bold mb-4">
      Find Reddit Leads 10× Faster with AI
    </h1>
    <p class="text-xl md:text-2xl mb-6 opacity-90">
      Stop scrolling for hours. Get AI-ranked posts that match your business goals, delivered automatically.
    </p>
    <div class="flex gap-4 justify-center flex-wrap">
      <button class="bg-white text-blue-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition">
        Try It Free →
      </button>
      <button class="border-2 border-white px-8 py-3 rounded-lg font-semibold hover:bg-white/10 transition">
        See How It Works
      </button>
    </div>
    <p class="mt-4 text-sm opacity-75">
      No credit card required • Free forever • 2-minute setup
    </p>
  </div>
</div>
```

---

## Value Props (3-Column Section)

```html
<div class="value-props py-16 px-6 bg-gray-50">
  <div class="max-w-6xl mx-auto">
    <h2 class="text-3xl font-bold text-center mb-12">Why Reddit Dashboarder?</h2>
    
    <div class="grid md:grid-cols-3 gap-8">
      <!-- Prop 1 -->
      <div class="text-center">
        <div class="text-5xl mb-4">🎯</div>
        <h3 class="text-xl font-semibold mb-2">AI-Powered Relevance</h3>
        <p class="text-gray-600">
          Every post scored 1-5 by AI based on YOUR goals. No more manual filtering.
        </p>
      </div>
      
      <!-- Prop 2 -->
      <div class="text-center">
        <div class="text-5xl mb-4">⚡</div>
        <h3 class="text-xl font-semibold mb-2">10× Faster Monitoring</h3>
        <p class="text-gray-600">
          Check 5 subreddits in 5 minutes instead of 2 hours. Automated digest API available.
        </p>
      </div>
      
      <!-- Prop 3 -->
      <div class="text-center">
        <div class="text-5xl mb-4">💰</div>
        <h3 class="text-xl font-semibold mb-2">Built for Lead Gen</h3>
        <p class="text-gray-600">
          SEO agencies, sales teams, recruiters — find warm leads before your competitors.
        </p>
      </div>
    </div>
  </div>
</div>
```

---

## Social Proof / Use Cases

```html
<div class="use-cases py-16 px-6">
  <div class="max-w-6xl mx-auto">
    <h2 class="text-3xl font-bold text-center mb-12">Who Uses Reddit Dashboarder?</h2>
    
    <div class="grid md:grid-cols-2 gap-8">
      <!-- Use Case 1 -->
      <div class="bg-white p-6 rounded-lg shadow-md">
        <h3 class="text-xl font-semibold mb-2">🎯 SEO Agencies</h3>
        <p class="text-gray-600 mb-4">
          "Found 3 paying clients in the first week by monitoring r/SEO and r/smallbusiness. 
          Saves me 10+ hours weekly."
        </p>
        <p class="text-sm text-gray-500 italic">— Agency owner, Berlin</p>
      </div>
      
      <!-- Use Case 2 -->
      <div class="bg-white p-6 rounded-lg shadow-md">
        <h3 class="text-xl font-semibold mb-2">💼 Sales Teams</h3>
        <p class="text-gray-600 mb-4">
          "Track competitor mentions and catch warm leads within 1 hour. 
          40% reply rate vs 5% with cold email."
        </p>
        <p class="text-sm text-gray-500 italic">— SaaS sales lead</p>
      </div>
      
      <!-- Use Case 3 -->
      <div class="bg-white p-6 rounded-lg shadow-md">
        <h3 class="text-xl font-semibold mb-2">📊 Market Researchers</h3>
        <p class="text-gray-600 mb-4">
          "Replaced 3 hours of manual trend spotting with a 5-minute daily digest. 
          Found 3 product ideas in a month."
        </p>
        <p class="text-sm text-gray-500 italic">— Indie hacker</p>
      </div>
      
      <!-- Use Case 4 -->
      <div class="bg-white p-6 rounded-lg shadow-md">
        <h3 class="text-xl font-semibold mb-2">🔍 Recruiters</h3>
        <p class="text-gray-600 mb-4">
          "Spot hiring posts and freelance opportunities 2 hours after they go live. 
          Huge advantage over job boards."
        </p>
        <p class="text-sm text-gray-500 italic">— Tech recruiter</p>
      </div>
    </div>
  </div>
</div>
```

---

## How It Works (Step-by-Step)

```html
<div class="how-it-works py-16 px-6 bg-gray-50">
  <div class="max-w-4xl mx-auto">
    <h2 class="text-3xl font-bold text-center mb-12">How It Works</h2>
    
    <div class="space-y-8">
      <div class="flex gap-4">
        <div class="flex-shrink-0 w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xl">1</div>
        <div>
          <h3 class="text-xl font-semibold mb-1">Connect Your Reddit Account</h3>
          <p class="text-gray-600">Secure OAuth in one click. Higher API limits, no password storage.</p>
        </div>
      </div>
      
      <div class="flex gap-4">
        <div class="flex-shrink-0 w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xl">2</div>
        <div>
          <h3 class="text-xl font-semibold mb-1">Choose Your Subreddits</h3>
          <p class="text-gray-600">Pick 3-10 subreddits to monitor. Use starter packs or go custom.</p>
        </div>
      </div>
      
      <div class="flex gap-4">
        <div class="flex-shrink-0 w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xl">3</div>
        <div>
          <h3 class="text-xl font-semibold mb-1">Set Your Goals</h3>
          <p class="text-gray-600">Tell the AI what you're looking for. Example: "Find SEO consulting opportunities"</p>
        </div>
      </div>
      
      <div class="flex gap-4">
        <div class="flex-shrink-0 w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xl">4</div>
        <div>
          <h3 class="text-xl font-semibold mb-1">Get Ranked Results</h3>
          <p class="text-gray-600">Every post scored 1-5 by AI. Sort by relevance, browse top matches first.</p>
        </div>
      </div>
      
      <div class="flex gap-4">
        <div class="flex-shrink-0 w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xl">5</div>
        <div>
          <h3 class="text-xl font-semibold mb-1">Automate Everything (Pro)</h3>
          <p class="text-gray-600">Digest API delivers hot leads via cron, Slack, or email. Set it and forget it.</p>
        </div>
      </div>
    </div>
  </div>
</div>
```

---

## CTA Section (Bottom)

```html
<div class="cta-section py-16 px-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
  <div class="max-w-3xl mx-auto text-center">
    <h2 class="text-3xl md:text-4xl font-bold mb-4">
      Ready to Find Your Next Client on Reddit?
    </h2>
    <p class="text-xl mb-8 opacity-90">
      Join 100+ agencies, sales teams, and indie hackers already using Reddit Dashboarder.
    </p>
    <button class="bg-white text-blue-600 px-10 py-4 rounded-lg font-semibold text-lg hover:bg-gray-100 transition">
      Start Free Now →
    </button>
    <p class="mt-4 text-sm opacity-75">
      No credit card • 2-minute setup • Cancel anytime
    </p>
  </div>
</div>
```

---

## Footer

```html
<footer class="bg-gray-900 text-gray-300 py-12 px-6">
  <div class="max-w-6xl mx-auto grid md:grid-cols-4 gap-8">
    <div>
      <h3 class="font-semibold text-white mb-3">Product</h3>
      <ul class="space-y-2">
        <li><a href="#features" class="hover:text-white">Features</a></li>
        <li><a href="#pricing" class="hover:text-white">Pricing</a></li>
        <li><a href="#docs" class="hover:text-white">Documentation</a></li>
        <li><a href="#api" class="hover:text-white">API</a></li>
      </ul>
    </div>
    
    <div>
      <h3 class="font-semibold text-white mb-3">Resources</h3>
      <ul class="space-y-2">
        <li><a href="#blog" class="hover:text-white">Blog</a></li>
        <li><a href="#use-cases" class="hover:text-white">Use Cases</a></li>
        <li><a href="#changelog" class="hover:text-white">Changelog</a></li>
        <li><a href="https://github.com/vesivanov/reddit-dashboarder" class="hover:text-white">GitHub</a></li>
      </ul>
    </div>
    
    <div>
      <h3 class="font-semibold text-white mb-3">Company</h3>
      <ul class="space-y-2">
        <li><a href="#about" class="hover:text-white">About</a></li>
        <li><a href="mailto:contact@example.com" class="hover:text-white">Contact</a></li>
        <li><a href="#privacy" class="hover:text-white">Privacy</a></li>
        <li><a href="#terms" class="hover:text-white">Terms</a></li>
      </ul>
    </div>
    
    <div>
      <h3 class="font-semibold text-white mb-3">Stay Updated</h3>
      <p class="text-sm mb-3">Get notified when Pro launches</p>
      <form class="flex gap-2">
        <input type="email" placeholder="your@email.com" class="px-3 py-2 rounded bg-gray-800 text-white flex-1">
        <button class="bg-blue-600 px-4 py-2 rounded hover:bg-blue-700">→</button>
      </form>
    </div>
  </div>
  
  <div class="max-w-6xl mx-auto mt-8 pt-8 border-t border-gray-800 text-center text-sm">
    <p>© 2026 Reddit Dashboarder. Built with ❤️ by <a href="https://vesivanov.com" class="text-blue-400 hover:text-blue-300">Ves Ivanov</a></p>
  </div>
</footer>
```
