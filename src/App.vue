<script setup lang="ts">
import { RouterView } from "vue-router";
import NotificationProvider from "@/components/ui/NotificationProvider.vue";
</script>

<template>
  <NotificationProvider />
  <RouterView />
</template>