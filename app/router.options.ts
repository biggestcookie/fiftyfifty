import type { RouterConfig } from "@nuxt/schema";

export default <RouterConfig>{
  scrollBehaviorType: "smooth",
  scrollBehavior: (to) =>
    to.hash
      ? { el: to.hash, behavior: "smooth" }
      : { top: 0, left: 0, behavior: "smooth" },
};
