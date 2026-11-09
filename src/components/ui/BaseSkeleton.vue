<script setup lang="ts">
// BaseSkeleton - the one loading-shows-"content shape" primitive.
// Width/height come in as Tailwind classes via className so the JIT keeps
// them; elements may stagger pulse via style.animationDelay on wrappers.
withDefaults(defineProps<{
  // e.g. "w-32 h-4" - defaults to a full-width line
  className?: string
  // "rounded-full" for bars/lines; use rounded-2xl/xl for blocks
  rounded?: string
}>(), {
  className: '',
  rounded: 'rounded-full',
});
</script>

<template>
  <div
    :class="[
      'bg-gray-200/80 animate-pulse motion-reduce:animate-none',
      className || 'h-4 w-full',
      rounded,
    ]"
    aria-hidden="true"
  />
</template>
