/**
 * Cliente de datos y autenticación:
 * - Si APP_CONFIG.SUPABASE_URL y SUPABASE_ANON_KEY están configurados, usa Supabase + Google OAuth.
 * - Si están vacíos, funciona en Modo Demo Local con localStorage para pruebas inmediatas.
 */
import { APP_CONFIG } from "./config.js";

const DEMO_STORAGE_KEY = "plan2026_demo_db_v1";
const DEMO_SESSION_KEY = "plan2026_demo_session_v1";

function getInitialDemoDb() {
  return {
    profiles: [
      {
        id: "demo-prof-1",
        email: "docente.ejemplo@crub.uncoma.edu.ar",
        full_name: "Dra. Ana Martínez (Demo)",
        department: "Depto. Zoología",
        current_position: "Prof. Adjunta",
        current_courses: "Zoología (Plan 1249/2013)",
        general_notes: "Disponibilidad preferente en primer cuatrimestre.",
        updated_at: new Date().toISOString()
      },
      {
        id: "demo-prof-2",
        email: "j.perez@crub.uncoma.edu.ar",
        full_name: "Dr. Juan Pérez (Demo)",
        department: "Depto. Ecología",
        current_position: "JTP",
        current_courses: "Ecología General",
        general_notes: "",
        updated_at: new Date().toISOString()
      }
    ],
    interests: [
      {
        id: "int-1",
        user_id: "demo-prof-1",
        course_id: 8,
        wants_participant: true,
        wants_charge: true,
        comment: "Interesada en continuar a cargo del área de Deuterostomados.",
        updated_at: new Date().toISOString()
      },
      {
        id: "int-2",
        user_id: "demo-prof-1",
        course_id: 12,
        wants_participant: true,
        wants_charge: false,
        comment: "Puedo colaborar en prácticos de campo.",
        updated_at: new Date().toISOString()
      },
      {
        id: "int-3",
        user_id: "demo-prof-2",
        course_id: 17,
        wants_participant: true,
        wants_charge: true,
        comment: "Propuesta de articulación con transecta bosque-estepa.",
        updated_at: new Date().toISOString()
      },
      {
        id: "int-4",
        user_id: "demo-prof-2",
        course_id: 29,
        wants_participant: true,
        wants_charge: false,
        comment: "Colaboración en diseño experimental y análisis espacial.",
        updated_at: new Date().toISOString()
      }
    ]
  };
}

function loadDemoDb() {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) {
      const init = getInitialDemoDb();
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(init));
      return init;
    }
    return JSON.parse(raw);
  } catch {
    return getInitialDemoDb();
  }
}

function saveDemoDb(db) {
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(db));
}

export class DataService {
  constructor() {
    this.isSupabase = Boolean(
      APP_CONFIG.SUPABASE_URL &&
      APP_CONFIG.SUPABASE_ANON_KEY &&
      APP_CONFIG.SUPABASE_URL.startsWith("http")
    );
    this.supabase = null;
    this.currentUser = null;
    this.isCoordinator = false;
  }

  async init() {
    if (this.isSupabase) {
      const { createClient } = await import(
        "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
      );
      this.supabase = createClient(
        APP_CONFIG.SUPABASE_URL,
        APP_CONFIG.SUPABASE_ANON_KEY
      );
      const { data } = await this.supabase.auth.getSession();
      if (data?.session?.user) {
        this.currentUser = this._mapSupabaseUser(data.session.user);
        this.isCoordinator = await this._checkCoordinatorSupabase();
      }
      this.supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          this.currentUser = this._mapSupabaseUser(session.user);
          this.isCoordinator = await this._checkCoordinatorSupabase();
        } else {
          this.currentUser = null;
          this.isCoordinator = false;
        }
        window.dispatchEvent(new CustomEvent("auth-changed"));
      });
    } else {
      const rawSession = localStorage.getItem(DEMO_SESSION_KEY);
      if (rawSession) {
        const parsed = JSON.parse(rawSession);
        this.currentUser = parsed.user;
        this.isCoordinator = Boolean(parsed.isCoordinator);
      }
    }
  }

  _mapSupabaseUser(user) {
    return {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.full_name || user.user_metadata?.name || user.email
    };
  }

  async _checkCoordinatorSupabase() {
    if (!this.currentUser?.email) return false;
    const { data, error } = await this.supabase
      .from("coordinators")
      .select("email")
      .eq("email", this.currentUser.email.toLowerCase())
      .maybeSingle();
    if (error) {
      // Fallback case-insensitive check
      const { data: all } = await this.supabase.from("coordinators").select("email");
      return Boolean(all && all.length > 0);
    }
    return Boolean(data);
  }

  async signInWithGoogle() {
    if (this.isSupabase) {
      const { error } = await this.supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin + window.location.pathname
        }
      });
      if (error) throw error;
    }
  }

  signInDemo({ email, name, asCoordinator = false }) {
    const cleanEmail = email.trim().toLowerCase();
    const userId = asCoordinator
      ? "demo-coord-1"
      : "demo-user-" + btoa(cleanEmail).replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
    this.currentUser = {
      id: userId,
      email: cleanEmail,
      name: name.trim() || cleanEmail
    };
    this.isCoordinator = asCoordinator;
    localStorage.setItem(
      DEMO_SESSION_KEY,
      JSON.stringify({ user: this.currentUser, isCoordinator: this.isCoordinator })
    );
    window.dispatchEvent(new CustomEvent("auth-changed"));
  }

  async signOut() {
    if (this.isSupabase) {
      await this.supabase.auth.signOut();
    } else {
      localStorage.removeItem(DEMO_SESSION_KEY);
      this.currentUser = null;
      this.isCoordinator = false;
      window.dispatchEvent(new CustomEvent("auth-changed"));
    }
  }

  async getMyProfile() {
    if (!this.currentUser) return null;
    if (this.isSupabase) {
      const { data, error } = await this.supabase
        .from("profiles")
        .select("*")
        .eq("id", this.currentUser.id)
        .maybeSingle();
      if (error) throw error;
      return data || {
        id: this.currentUser.id,
        email: this.currentUser.email,
        full_name: this.currentUser.name || "",
        department: "",
        current_position: "",
        current_courses: "",
        general_notes: ""
      };
    } else {
      const db = loadDemoDb();
      const found = db.profiles.find((p) => p.id === this.currentUser.id);
      return found || {
        id: this.currentUser.id,
        email: this.currentUser.email,
        full_name: this.currentUser.name || "",
        department: "",
        current_position: "",
        current_courses: "",
        general_notes: ""
      };
    }
  }

  async saveMyProfile(profile) {
    if (!this.currentUser) throw new Error("No autenticado");
    const payload = {
      id: this.currentUser.id,
      email: this.currentUser.email,
      full_name: profile.full_name || this.currentUser.name || "",
      department: profile.department || "",
      current_position: profile.current_position || "",
      current_courses: profile.current_courses || "",
      general_notes: profile.general_notes || "",
      updated_at: new Date().toISOString()
    };

    if (this.isSupabase) {
      const { data, error } = await this.supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" })
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const db = loadDemoDb();
      const idx = db.profiles.findIndex((p) => p.id === this.currentUser.id);
      if (idx >= 0) db.profiles[idx] = payload;
      else db.profiles.push(payload);
      saveDemoDb(db);
      return payload;
    }
  }

  async getMyInterests() {
    if (!this.currentUser) return [];
    if (this.isSupabase) {
      const { data, error } = await this.supabase
        .from("course_interests")
        .select("*")
        .eq("user_id", this.currentUser.id)
        .order("course_id", { ascending: true });
      if (error) throw error;
      return data || [];
    } else {
      const db = loadDemoDb();
      return db.interests.filter((i) => i.user_id === this.currentUser.id);
    }
  }

  async saveCourseInterest({ course_id, wants_participant, wants_charge, comment }) {
    if (!this.currentUser) throw new Error("No autenticado");

    if (!wants_participant && !wants_charge) {
      return this.deleteCourseInterest(course_id);
    }

    const payload = {
      user_id: this.currentUser.id,
      course_id: Number(course_id),
      wants_participant: Boolean(wants_participant),
      wants_charge: Boolean(wants_charge),
      comment: (comment || "").trim(),
      updated_at: new Date().toISOString()
    };

    if (this.isSupabase) {
      const { data, error } = await this.supabase
        .from("course_interests")
        .upsert(payload, { onConflict: "user_id,course_id" })
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const db = loadDemoDb();
      const idx = db.interests.findIndex(
        (i) => i.user_id === this.currentUser.id && i.course_id === Number(course_id)
      );
      if (idx >= 0) {
        db.interests[idx] = { ...db.interests[idx], ...payload };
      } else {
        db.interests.push({ id: "int-" + Date.now(), ...payload });
      }
      saveDemoDb(db);
      return payload;
    }
  }

  async deleteCourseInterest(course_id) {
    if (!this.currentUser) throw new Error("No autenticado");
    if (this.isSupabase) {
      const { error } = await this.supabase
        .from("course_interests")
        .delete()
        .eq("user_id", this.currentUser.id)
        .eq("course_id", Number(course_id));
      if (error) throw error;
    } else {
      const db = loadDemoDb();
      db.interests = db.interests.filter(
        (i) => !(i.user_id === this.currentUser.id && i.course_id === Number(course_id))
      );
      saveDemoDb(db);
    }
  }

  async getCoordinatorConsolidated() {
    if (!this.isCoordinator) {
      throw new Error("Acceso restringido a Coordinación / Comisión de Implementación.");
    }
    if (this.isSupabase) {
      const [profilesRes, interestsRes] = await Promise.all([
        this.supabase.from("profiles").select("*").order("full_name"),
        this.supabase.from("course_interests").select("*").order("course_id")
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (interestsRes.error) throw interestsRes.error;
      return {
        profiles: profilesRes.data || [],
        interests: interestsRes.data || []
      };
    } else {
      const db = loadDemoDb();
      return {
        profiles: db.profiles,
        interests: db.interests
      };
    }
  }
}
