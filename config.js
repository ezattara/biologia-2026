/**
 * Configuración de conexión a Supabase.
 *
 * Para conectar con tu proyecto real de Supabase (con Google Sign-In):
 * 1. Completar `SUPABASE_URL` y `SUPABASE_ANON_KEY` con los valores de tu proyecto
 *    (Project Settings -> API en Supabase).
 * 2. Dejar vacíos ambos campos para usar el Modo Demo Local (almacenamiento en localStorage).
 */
export const APP_CONFIG = {
  SUPABASE_URL: "https://wfkxflwywmhvjqijnmqv.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_lEKd_bpisiIJd8XtoMa0Jg_VLqV60A9",
  // Opcional: mostrar acceso rápido de prueba en Modo Demo Local
  DEMO_COORDINATOR_EMAIL: "coordinacion.biologia@comahue-conicet.gob.ar"
};
