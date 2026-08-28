"use client";
import { WorldMap } from "./world-map";
import { motion } from "framer-motion";

export function WorldMapDemo() {
  return (
    <div className="py-12 sm:py-20 bg-[var(--bg)] text-[var(--ink)] w-full rounded-2xl border border-[var(--line)] p-6">
      <div className="max-w-4xl mx-auto text-center mb-8">
        <p className="font-display text-2xl sm:text-4xl font-bold uppercase tracking-tight">
          Global{" "}
          <span className="dept-accent">
            {"Connectivity".split("").map((word, idx) => (
              <motion.span
                key={idx}
                className="inline-block"
                initial={{ x: -10, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: idx * 0.04 }}
              >
                {word}
              </motion.span>
            ))}
          </span>
        </p>
        <p className="text-xs sm:text-sm text-[var(--muted)] max-w-xl mx-auto py-3">
          Real-time global telemetry routing, active client sessions, and cross-border marketing infrastructure across the Americas, Caribbean, Europe, and Asia.
        </p>
      </div>
      <WorldMap
        dots={[
          {
            start: {
              lat: 64.2008,
              lng: -149.4937,
              label: "Alaska",
            },
            end: {
              lat: 34.0522,
              lng: -118.2437,
              label: "Los Angeles",
            },
          },
          {
            start: { lat: 34.0522, lng: -118.2437, label: "Los Angeles" },
            end: { lat: 18.0179, lng: -76.8099, label: "Kingston" },
          },
          {
            start: { lat: 18.0179, lng: -76.8099, label: "Kingston" },
            end: { lat: -15.7975, lng: -47.8919, label: "Brasília" },
          },
          {
            start: { lat: 18.0179, lng: -76.8099, label: "Kingston" },
            end: { lat: 51.5074, lng: -0.1278, label: "London" },
          },
          {
            start: { lat: 51.5074, lng: -0.1278, label: "London" },
            end: { lat: 38.7223, lng: -9.1393, label: "Lisbon" },
          },
          {
            start: { lat: 51.5074, lng: -0.1278, label: "London" },
            end: { lat: 28.6139, lng: 77.209, label: "New Delhi" },
          },
          {
            start: { lat: 28.6139, lng: 77.209, label: "New Delhi" },
            end: { lat: 1.3521, lng: 103.8198, label: "Singapore" },
          },
          {
            start: { lat: 28.6139, lng: 77.209, label: "New Delhi" },
            end: { lat: -1.2921, lng: 36.8219, label: "Nairobi" },
          },
        ]}
      />
    </div>
  );
}
