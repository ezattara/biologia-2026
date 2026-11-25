# Guía de Configuración y Despliegue (Supabase + Google Sign-In)

Esta aplicación web es 100% estática (HTML + CSS + JS) y utiliza **Supabase** (plan gratuito) como base de datos PostgreSQL con **Row Level Security (RLS)** y **Google Sign-In**.

La seguridad de privacidad está garantizada a nivel de base de datos:
- Cada docente autenticado con Google **solo puede ver y editar sus propias respuestas**.
- Únicamente los correos incluidos en la tabla `coordinators` pueden ver el consolidado completo de todos los docentes.

---

## Paso 1: Crear el proyecto en Supabase

1. Ingresar a [https://supabase.com](https://supabase.com) y crear una cuenta gratuita.
2. Crear un nuevo proyecto (ej. `plan-biologia-2026`).
3. Ir a **SQL Editor → New Query**, copiar todo el contenido de [`supabase_schema.sql`](supabase_schema.sql) y presionar **Run**.
4. Cargar los correos de quienes tendrán acceso a la vista de Coordinación / Comisión de Implementación ejecutando en el **SQL Editor**:
   ```sql
   insert into public.coordinators (email, name) values
     ('coordinacion.biologia@crub.uncoma.edu.ar', 'Coordinación de Carrera'),
     ('otro.miembro@gmail.com', 'Miembro Comisión');
   ```

---

## Paso 2: Habilitar Google Sign-In

1. En [Google Cloud Console](https://console.cloud.google.com/):
   - Crear un proyecto (o usar uno existente).
   - Ir a **APIs & Services → Credentials → Create Credentials → OAuth client ID** (tipo *Web application*).
   - En **Authorized redirect URIs**, agregar la URL de callback que te muestra Supabase en **Authentication → Providers → Google** (formato: `https://<TU-PROYECTO>.supabase.co/auth/v1/callback`).
   - Copiar el **Client ID** y **Client Secret**.
2. En **Supabase → Authentication → Providers → Google**:
   - Activar el proveedor **Google**.
   - Pegar el **Client ID** y **Client Secret**.
   - Guardar.
3. En **Supabase → Authentication → URL Configuration**:
   - Configurar **Site URL** con la URL donde publiques la web (ej. `https://tu-usuario.github.io/plan-2026/`).
   - Agregar esa misma URL (y `http://localhost` si probás localmente) en **Redirect URLs**.

---

## Paso 3: Conectar el frontend

1. En **Supabase → Project Settings → API**, copiar:
   - **Project URL** (`SUPABASE_URL`)
   - **anon / public key** (`SUPABASE_ANON_KEY`)
2. Pegar ambos valores en [`config.js`](config.js):
   ```js
   export const APP_CONFIG = {
     SUPABASE_URL: "https://tu-proyecto.supabase.co",
     SUPABASE_ANON_KEY: "tu-anon-key-publica"
   };
   ```

---

## Paso 4: Publicar la aplicación web (gratis)

Como la carpeta `web/` no requiere compilación (`npm` ni `build`), podés publicarla directamente en cualquiera de estas opciones gratuitas:
- **GitHub Pages**: Subir el contenido de `web/` a un repositorio y activar Pages.
- **Netlify Drop**: Arrastrar la carpeta `web/` en [https://app.netlify.com/drop](https://app.netlify.com/drop).
- **Cloudflare Pages / Vercel**: Conectar el repositorio apuntando a la carpeta `web/`.
