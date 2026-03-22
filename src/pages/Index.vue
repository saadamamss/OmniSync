<script setup lang="ts">
import { Zap, Shield, BarChart3, Globe, ArrowRight, CheckCircle2, Star, Plus, Minus } from 'lucide-vue-next';
import { ref } from 'vue';

const features = [
  {
    title: 'Instant Training',
    desc: 'Train your AI on your website, PDFs, or text in seconds.',
    icon: Zap,
    color: 'bg-blue-50 text-blue-600'
  },
  {
    title: 'Enterprise Security',
    desc: 'Your data is encrypted and private. We never share your info.',
    icon: Shield,
    color: 'bg-green-50 text-green-600'
  },
  {
    title: 'Advanced Analytics',
    desc: 'Track every conversation and gain insights into customer needs.',
    icon: BarChart3,
    color: 'bg-purple-50 text-purple-600'
  },
  {
    title: 'Multi-language',
    desc: 'Support customers in 95+ languages automatically.',
    icon: Globe,
    color: 'bg-orange-50 text-orange-600'
  }
];

const pricing = [
  {
    name: 'Starter',
    id: 'starter',
    price: '0',
    desc: 'Perfect for side projects',
    features: ['1 Chatbot', '1,000 messages/mo', 'Website crawling', 'Standard support'],
    cta: 'Start for Free',
    popular: false
  },
  {
    name: 'Pro',
    id: 'pro',
    price: '49',
    desc: 'For growing businesses',
    features: ['5 Chatbots', '10,000 messages/mo', 'PDF & Doc support', 'Custom branding', 'Priority support'],
    cta: 'Get Started',
    popular: true
  },
  {
    name: 'Enterprise',
    id: 'enterprise',
    price: 'Custom',
    desc: 'For large organizations',
    features: ['Unlimited Chatbots', 'Unlimited messages', 'API Access', 'Dedicated manager', 'SLA Guarantee'],
    cta: 'Contact Sales',
    popular: false
  }
];

const faqs = ref([
  {
    q: "How does the AI learn about my business?",
    a: "You can provide your website URL, upload PDF documents, or paste raw text. Our AI crawls and indexes this information to provide accurate answers based solely on your data.",
    open: false
  },
  {
    q: "Can I customize the look of the chat widget?",
    a: "Yes! You can change colors, add your logo, set a custom welcome message, and choose between different widget styles to match your brand perfectly.",
    open: false
  },
  {
    q: "Does it support multiple languages?",
    a: "Absolutely. OmniSync AI can understand and respond in over 95 languages, automatically detecting the user's language.",
    open: false
  }
]);

const testimonials = [
  {
    name: "Sarah Chen",
    role: "CEO at TechFlow",
    content: "OmniSync AI reduced our support tickets by 65% in the first month. It's like having a support team that never sleeps.",
    avatar: "https://i.pravatar.cc/150?u=sarah"
  },
  {
    name: "James Wilson",
    role: "Product Manager",
    content: "The setup was incredibly fast. We trained it on our entire documentation in under 5 minutes. Truly impressive.",
    avatar: "https://i.pravatar.cc/150?u=james"
  }
];
</script>

<template>
  <div class="overflow-x-hidden">
    <!-- Hero Section -->
    <section class="relative pt-32 pb-20 lg:pt-48 lg:pb-32 px-6">
      <div class="max-w-7xl mx-auto text-center">
        <div data-aos="fade-up" class="inline-flex items-center space-x-2 bg-orange-50 text-orange-600 px-4 py-2 rounded-full text-sm font-medium mb-8">
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
          </span>
          <span>New: GPT-4o Integration is live!</span>
        </div>
        
        <h1 data-aos="fade-up" data-aos-delay="100" class="text-5xl lg:text-7xl font-extrabold text-gray-900 tracking-tight mb-8">
          Your Customer Support <br />
          <span class="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-rose-500">On Autopilot</span>
        </h1>
        
        <p data-aos="fade-up" data-aos-delay="200" class="max-w-2xl mx-auto text-xl text-gray-600 mb-10 leading-relaxed">
          Build a custom AI chatbot that knows your business inside out. Reduce support tickets by 70% and delight your customers 24/7.
        </p>
        
        <div data-aos="fade-up" data-aos-delay="300" class="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4">
          <router-link to="/register" class="w-full sm:w-auto bg-gray-900 text-white px-8 py-4 rounded-full text-lg font-bold hover:bg-gray-800 transition-all flex items-center justify-center group">
            Start Free Trial
            <ArrowRight class="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </router-link>
          <a href="#demo" class="w-full sm:w-auto bg-white text-gray-900 border border-gray-200 px-8 py-4 rounded-full text-lg font-bold hover:bg-gray-50 transition-all">
            Watch Demo
          </a>
        </div>

        <!-- Hero Image -->
        <div data-aos="zoom-in-up" data-aos-delay="400" class="mt-20 relative max-w-5xl mx-auto">
          <div class="absolute -inset-1 bg-gradient-to-r from-orange-500 to-rose-500 rounded-2xl blur opacity-20"></div>
          <div class="relative bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
            <img src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=2426" alt="Dashboard Preview" class="w-full h-auto" />
          </div>
        </div>
      </div>
    </section>

    <!-- Features Section -->
    <section id="features" class="py-24 bg-gray-50 px-6">
      <div class="max-w-7xl mx-auto">
        <div class="text-center mb-20">
          <h2 data-aos="fade-up" class="text-3xl lg:text-5xl font-bold text-gray-900 mb-4">Everything you need to scale</h2>
          <p data-aos="fade-up" data-aos-delay="100" class="text-xl text-gray-600">Powerful tools designed for modern businesses.</p>
        </div>

        <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div v-for="(f, i) in features" :key="i" data-aos="fade-up" :data-aos-delay="i * 100" class="bg-white p-8 rounded-3xl border border-gray-100 hover:shadow-xl transition-all group">
            <div :class="['w-14 h-14 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform', f.color]">
              <component :is="f.icon" class="w-7 h-7" />
            </div>
            <h3 class="text-xl font-bold text-gray-900 mb-3">{{ f.title }}</h3>
            <p class="text-gray-600 leading-relaxed">{{ f.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Testimonials -->
    <section class="py-24 px-6">
      <div class="max-w-7xl mx-auto">
        <div class="grid md:grid-cols-2 gap-12">
          <div v-for="(t, i) in testimonials" :key="i" data-aos="fade-right" :data-aos-delay="i * 100" class="bg-white p-10 rounded-[2.5rem] border border-gray-100 shadow-sm">
            <div class="flex items-center space-x-1 text-orange-500 mb-6">
              <Star v-for="s in 5" :key="s" class="w-5 h-5 fill-current" />
            </div>
            <p class="text-xl text-gray-700 mb-8 italic">"{{ t.content }}"</p>
            <div class="flex items-center space-x-4">
              <img :src="t.avatar" class="w-12 h-12 rounded-full" />
              <div>
                <h4 class="font-bold text-gray-900">{{ t.name }}</h4>
                <p class="text-sm text-gray-500">{{ t.role }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Pricing Section -->
    <section id="pricing" class="py-24 bg-gray-900 px-6">
      <div class="max-w-7xl mx-auto">
        <div class="text-center mb-20">
          <h2 data-aos="fade-up" class="text-3xl lg:text-5xl font-bold text-white mb-4">Simple, transparent pricing</h2>
          <p data-aos="fade-up" data-aos-delay="100" class="text-xl text-gray-400">Choose the plan that works best for you.</p>
        </div>

        <div class="grid md:grid-cols-3 gap-8">
          <div v-for="(p, i) in pricing" :key="i" data-aos="fade-up" :data-aos-delay="i * 100" 
            :class="['p-10 rounded-[2.5rem] border flex flex-col relative', p.popular ? 'bg-white border-white' : 'bg-gray-800/50 border-gray-700']">
            <div v-if="p.popular" class="absolute -top-4 left-1/2 -translate-x-1/2 bg-orange-500 text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              Most Popular
            </div>
            <h3 :class="['text-xl font-bold mb-2', p.popular ? 'text-gray-900' : 'text-white']">{{ p.name }}</h3>
            <p :class="['text-sm mb-8', p.popular ? 'text-gray-500' : 'text-gray-400']">{{ p.desc }}</p>
            <div class="mb-8">
              <span :class="['text-4xl font-bold', p.popular ? 'text-gray-900' : 'text-white']">${{ p.price }}</span>
              <span v-if="p.price !== 'Custom'" :class="['text-sm', p.popular ? 'text-gray-500' : 'text-gray-400']">/month</span>
            </div>
            <ul class="space-y-4 mb-10 flex-1">
              <li v-for="feat in p.features" :key="feat" :class="['flex items-center text-sm', p.popular ? 'text-gray-600' : 'text-gray-300']">
                <CheckCircle2 class="w-4 h-4 mr-3 text-orange-500" />
                {{ feat }}
              </li>
            </ul>
            <router-link :to="{ path: '/register', query: { plan: p.id } }" 
              :class="['w-full py-4 rounded-2xl font-bold text-center transition-all', p.popular ? 'bg-gray-900 text-white hover:bg-gray-800' : 'bg-white text-gray-900 hover:bg-gray-100']">
              {{ p.cta }}
            </router-link>
          </div>
        </div>
      </div>
    </section>

    <!-- FAQ Section -->
    <section class="py-24 px-6 bg-white">
      <div class="max-w-3xl mx-auto">
        <h2 data-aos="fade-up" class="text-3xl lg:text-5xl font-bold text-gray-900 mb-12 text-center">Frequently Asked Questions</h2>
        <div class="space-y-4">
          <div v-for="(faq, i) in faqs" :key="i" data-aos="fade-up" :data-aos-delay="i * 100" class="border border-gray-100 rounded-2xl overflow-hidden">
            <button @click="faq.open = !faq.open" class="w-full p-6 text-left flex items-center justify-between hover:bg-gray-50 transition-all">
              <span class="font-bold text-gray-900">{{ faq.q }}</span>
              <Plus v-if="!faq.open" class="w-5 h-5 text-gray-400" />
              <Minus v-else class="w-5 h-5 text-orange-500" />
            </button>
            <div v-if="faq.open" class="p-6 pt-0 text-gray-600 leading-relaxed">
              {{ faq.a }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="py-24 px-6">
      <div data-aos="zoom-in" class="max-w-5xl mx-auto bg-gray-900 rounded-[3rem] p-12 lg:p-20 text-center relative overflow-hidden">
        <div class="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-orange-500/20 via-transparent to-transparent"></div>
        <h2 class="text-3xl lg:text-5xl font-bold text-white mb-8 relative z-10">Ready to transform your <br /> customer experience?</h2>
        <p class="text-gray-400 text-xl mb-10 max-w-2xl mx-auto relative z-10">Join 2,000+ companies using OmniSync AI to automate their support and sales.</p>
        <div class="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4 relative z-10">
          <router-link to="/register" class="bg-orange-500 text-white px-10 py-4 rounded-full text-lg font-bold hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/20">
            Get Started for Free
          </router-link>
          <span class="text-gray-500 text-sm flex items-center">
            <CheckCircle2 class="w-4 h-4 mr-2 text-green-500" /> No credit card required
          </span>
        </div>
      </div>
    </section>
  </div>
</template>