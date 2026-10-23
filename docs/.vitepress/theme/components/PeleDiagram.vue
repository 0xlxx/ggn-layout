<script setup lang="ts">
import type { Mounted } from "pele";
import { onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps<{ graph: string; id: string }>();

const canvas = ref<HTMLElement>();
const error = ref("");
const ready = ref(false);
let mounted: Mounted | undefined;
let revision = 0;

async function renderDiagram(): Promise<void> {
  const current = ++revision;
  const element = canvas.value;
  if (!element) return;

  mounted?.destroy();
  mounted = undefined;
  error.value = "";
  ready.value = false;

  try {
    const { mountAsync } = await import("pele/lazy");
    if (current !== revision || !canvas.value) return;

    mounted = await mountAsync(element, decodeURIComponent(props.graph), {
      idPrefix: props.id,
      zoom: {
        maxScale: 3,
        labels: {
          zoomIn: "放大",
          zoomOut: "缩小",
          reset: "恢复原始大小",
        },
      },
    });

    if (current !== revision) {
      mounted.destroy();
      mounted = undefined;
      return;
    }

    ready.value = true;
  } catch (cause) {
    if (current === revision) {
      error.value = cause instanceof Error ? cause.message : String(cause);
    }
  }
}

onMounted(renderDiagram);

onBeforeUnmount(() => {
  revision += 1;
  mounted?.destroy();
});
</script>

<template>
  <div class="pele-diagram" :data-diagram-id="id" :aria-busy="!ready && !error">
    <div ref="canvas" class="pele-diagram__canvas" />
    <p v-if="error" class="pele-diagram__state pele-diagram__state--error">
      图表渲染失败：{{ error }}
    </p>
    <p v-else-if="!ready" class="pele-diagram__state">正在渲染图表…</p>
  </div>
</template>
