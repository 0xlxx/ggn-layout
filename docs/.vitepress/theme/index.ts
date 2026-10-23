import DefaultTheme from "vitepress/theme";
import PeleDiagram from "./components/PeleDiagram.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }: { app: { component(name: string, component: unknown): void } }) {
    app.component("PeleDiagram", PeleDiagram);
  },
};
