import { ref } from 'vue';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

interface Notification {
  id: number;
  message: string;
  type: NotificationType;
}

const notifications = ref<Notification[]>([]);
const confirmState = ref({
  show: false,
  title: '',
  message: '',
  resolve: null as ((value: boolean) => void) | null
});

export const useNotification = () => {
  const showToast = (message: string, type: NotificationType = 'success') => {
    const id = Date.now();
    notifications.value.push({ id, message, type });
    setTimeout(() => {
      notifications.value = notifications.value.filter(n => n.id !== id);
    }, 4000);
  };

  const askConfirm = (title: string, message: string): Promise<boolean> => {
    confirmState.value = {
      show: true,
      title,
      message,
      resolve: null
    };
    return new Promise((resolve) => {
      confirmState.value.resolve = resolve;
    });
  };

  const handleConfirm = (value: boolean) => {
    if (confirmState.value.resolve) {
      confirmState.value.resolve(value);
    }
    confirmState.value.show = false;
  };

  return {
    notifications,
    confirmState,
    showToast,
    askConfirm,
    handleConfirm
  };
};