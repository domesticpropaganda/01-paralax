import GUI from "lil-gui";
import * as React from "react";
import manifest from "~/src/artworks/manifest.json";
import { InfiniteCanvas } from "~/src/infinite-canvas";
import type { MediaItem } from "~/src/infinite-canvas/types";

type SceneParams = {
  backgroundColor: string;
  fogNear: number;
  fogFar: number;
  dofWorldFocusDistance: number;
  dofWorldFocusRange: number;
  dofBokehScale: number;
  autoScrollSpeed: number;
  planeScale: number;
  planeDensity: number;
  planeSpread: number;
  mode: "default" | "minimal";
  color0: string;
  color1: string;
  color2: string;
  color3: string;
};

const DEFAULTS: SceneParams = {
  backgroundColor: "#222222",
  fogNear: 120,
  fogFar: 320,
  dofWorldFocusDistance: 45,
  dofWorldFocusRange: 60,
  dofBokehScale: 6,
  autoScrollSpeed: 0.35,
  planeScale: 3,
  planeDensity: 1,
  planeSpread: 1,
  mode: "default" as const,
  color0: "#3ABF64",
  color1: "#6C28FF",
  color2: "#FF6839",
  color3: "#E583E0",
};

export function App() {
  const [params, setParams] = React.useState<SceneParams>(DEFAULTS);

  const media = React.useMemo(() => {
    const colorOverrides = [params.color0, params.color1, params.color2, params.color3];
    const colorCards = colorOverrides.map((color) => ({ url: "", width: 1, height: 1, color }));
    const images = (manifest as MediaItem[]).filter((m) => !m.color);

    if (params.mode === "minimal") return colorCards;

    // Default: 1 image followed by 2 color cards → exactly 1/3 images
    const result: MediaItem[] = [];
    images.forEach((img, i) => {
      result.push(img);
      result.push(colorCards[i * 2 % colorCards.length]);
      result.push(colorCards[(i * 2 + 1) % colorCards.length]);
    });
    return result;
  }, [params.mode, params.color0, params.color1, params.color2, params.color3]);

  React.useEffect(() => {
    const gui = new GUI({ title: "Scene Controls" });
    const p = { ...DEFAULTS };

    const update = () => setParams({ ...p });

    gui.addColor(p, "backgroundColor").name("Background").onChange(update);

    const fog = gui.addFolder("Fog");
    fog.add(p, "fogNear", 0, 400, 1).name("Near").onChange(update);
    fog.add(p, "fogFar", 50, 600, 1).name("Far").onChange(update);

    const dof = gui.addFolder("Depth of Field");
    dof.add(p, "dofWorldFocusDistance", 0, 150, 1).name("Focus Distance").onChange(update);
    dof.add(p, "dofWorldFocusRange", 1, 100, 1).name("Focus Range").onChange(update);
    dof.add(p, "dofBokehScale", 0, 10, 0.1).name("Bokeh Scale").onChange(update);

    const scroll = gui.addFolder("Auto Scroll");
    scroll.add(p, "autoScrollSpeed", 0, 2, 0.01).name("Speed").onChange(update);

    const images = gui.addFolder("Images");
    images.add(p, "mode", { Default: "default", Minimal: "minimal" }).name("Mode").onChange(update);
    images.add(p, "planeScale", 0.25, 3, 0.05).name("Scale").onChange(update);
    images.add(p, "planeDensity", 1, 15, 1).name("Density").onChange(update);
    images.add(p, "planeSpread", 0.3, 2, 0.05).name("Spread").onChange(update);

    const colors = gui.addFolder("Colors");
    colors.addColor(p, "color0").name("Color 1").onChange(update);
    colors.addColor(p, "color1").name("Color 2").onChange(update);
    colors.addColor(p, "color2").name("Color 3").onChange(update);
    colors.addColor(p, "color3").name("Color 4").onChange(update);

    gui.add({
      exportPng: () => {
        const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
        if (!canvas) return;
        const a = document.createElement("a");
        a.download = `export-${Date.now()}.png`;
        a.href = canvas.toDataURL("image/png");
        a.click();
      },
    }, "exportPng").name("Export PNG");

    return () => gui.destroy();
  }, []);

  return (
    <InfiniteCanvas
      media={media}
      backgroundColor={params.backgroundColor}
      fogColor={params.backgroundColor}
      fogNear={params.fogNear}
      fogFar={params.fogFar}
      dofWorldFocusDistance={params.dofWorldFocusDistance}
      dofWorldFocusRange={params.dofWorldFocusRange}
      dofBokehScale={params.dofBokehScale}
      autoScrollSpeed={params.autoScrollSpeed}
      planeScale={params.planeScale}
      planeDensity={params.planeDensity}
      planeSpread={params.planeSpread}
    />
  );
}
