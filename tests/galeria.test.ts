import { test } from "node:test";
import assert from "node:assert/strict";
import { armarGaleria, indiceEntreFotos, posicionDeFoto, videoReproducible } from "../lib/galeria";

test("el video va tercero, y al final si hay menos de dos fotos", () => {
  const medios = armarGaleria(["a", "b", "c"], ["v"], null);
  assert.deepEqual(medios.map((m) => m.tipo), ["foto", "foto", "video", "foto"]);
  assert.equal(medios[2].tipo === "video" && medios[2].poster, "a");

  assert.deepEqual(armarGaleria(["a"], ["v"]).map((m) => m.tipo), ["foto", "video"]);
  assert.deepEqual(armarGaleria([], ["v"]).map((m) => m.tipo), ["video"]);
  assert.deepEqual(armarGaleria(["a", "b"], []).map((m) => m.tipo), ["foto", "foto"]);
});

test("varios videos van seguidos desde el tercer lugar", () => {
  const medios = armarGaleria(["a", "b", "c"], ["v1", "v2"]);
  assert.deepEqual(medios.map((m) => m.tipo), ["foto", "foto", "video", "video", "foto"]);
});

test("la traducción entre índice de galería y de fotos", () => {
  const medios = armarGaleria(["a", "b", "c"], ["v"]);
  assert.equal(indiceEntreFotos(medios, 3), 2);
  assert.equal(posicionDeFoto(medios, 2), 3);
  assert.equal(posicionDeFoto(medios, 0), 0);
});

test("solo se reproducen los contenedores web", () => {
  assert.equal(videoReproducible({ url: "x.mp4" }), true);
  assert.equal(videoReproducible({ url: "x.m4v" }), true);
  assert.equal(videoReproducible({ url: "x.webm?x=1" }), true);
  assert.equal(videoReproducible({ url: "x.mov" }), false);
  assert.equal(videoReproducible({ url: "x.mov", tipo: "video/quicktime" }), false);
  assert.equal(videoReproducible({ url: "x.bin", tipo: "video/x-m4v" }), true);
  assert.equal(videoReproducible({ url: "https://blob/abc" }), true);
});
