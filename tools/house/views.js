/**
 * The views, and what each is held to. The hall from where the player starts,
 * through the painting's own camera, is the reference's own view; the others are the hall's other ways of being
 * seen. `room` is the room each view judges, and the tuner turns.
 */
export const VIEWS = [
  { room: 'hall', name: 'hall, from where it was painted (the reference view)', painting: true, regions: true },
  { room: 'hall', name: 'hall, toward the stairs', pos: [-1.2, 3.2], yaw: -0.55, pitch: 0.05 },
  { room: 'hall', name: 'hall, back toward the window', pos: [0.6, 0.9], yaw: 2.4, pitch: -0.05 },
  // Every other room, from its doorway, as a player first sees it (9.6).
  { room: 'parlour', name: 'parlour, from its door', pos: [-1.6, -0.5], yaw: 1.25, pitch: -0.08 },
  { room: 'dining', name: 'dining room, from its door', pos: [-1.3, -4.5], yaw: Math.PI / 2, pitch: -0.08 },
  { room: 'kitchen', name: 'kitchen, from the passage', pos: [1.6, -4.5], yaw: -Math.PI / 2, pitch: -0.08 },
  { room: 'study', name: 'study, from its door', pos: [4.0, -2.6], yaw: Math.PI, pitch: -0.08 },
  { room: 'passage', name: 'back passage, from the arch', pos: [0.1, -0.4], yaw: 0, pitch: -0.05 },
  { room: 'landing', name: 'landing, from the stairs', pos: [1.6, -3.5], y: 3, yaw: 0.5, pitch: -0.05 },
  { room: 'gallery', name: 'gallery, from the landing', pos: [0.15, -2.6], y: 3, yaw: Math.PI, pitch: -0.05 },
  { room: 'bedroom', name: 'bedroom, from its door', pos: [-1.3, -1.5], y: 3, yaw: Math.PI / 2, pitch: -0.08 },
  { room: 'child', name: "child's room, from its door", pos: [-1.3, -4.5], y: 3, yaw: Math.PI / 2, pitch: -0.08 },
  { room: 'bathroom', name: 'bathroom, from its door', pos: [2.8, -4.5], y: 3, yaw: -Math.PI / 2, pitch: -0.08 },
];
