# AI Rules & Tech Stack

## Tech Stack
- **Vue 3 (Vite)**: The core framework for building the application using the Composition API.
- **TypeScript**: Used for all logic to ensure type safety and better developer experience.
- **Tailwind CSS**: The primary utility-first CSS framework for all styling and responsive design.
- **Lucide Vue Next**: The default icon library for all UI icons.
- **Vue Router**: Used for handling client-side navigation and routing.
- **@vueuse/motion**: Preferred for animations and transitions (replacing legacy AOS).

## Coding Rules
- **Component Structure**: Every new component must be created in its own file within `src/components/` using the `<script setup>` syntax.
- **Page Management**: All route-level components should reside in `src/pages/`. The entry point is `src/pages/Index.vue`.
- **Routing**: All application routes must be defined and maintained in `src/router/index.ts`.
- **Styling**: Utilize Tailwind CSS classes exclusively. Avoid creating new `.css` files.
- **Icons**: Use `lucide-vue-next` icons.
- **State Management**: Use standard Vue Composition API (`ref`, `reactive`) or Pinia if global state is needed.
- **Formatting**: Never use markdown code blocks (```) in responses. Always use the provided custom tags for code operations.
- **Responsiveness**: All UI changes must be fully responsive and mobile-friendly by default.