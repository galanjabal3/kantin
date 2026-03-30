import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import toast from "react-hot-toast";

export default function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await login(email, password);
      setAuth(
        data.access_token,
        data.user_type,
        data.restaurant_id,
        data.restaurant_slug,
      );
      toast.success("Berhasil masuk!");
      if (data.user_type === "admin") navigate("/admin");
      else navigate("/dashboard");
    } catch (err: any) {
      toast.error(err.message || "Email atau password salah");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-brand-500 rounded-xl mb-4">
            {/* <span className="text-white text-xl font-bold">K</span> */}
            <img src="/logo.svg" alt="Kantin" className="w-8 h-8" />
          </div>
          <h1
            className="text-3xl text-gray-900"
            style={{ fontFamily: "Playfair Display, serif" }}
          >
            Kantin
          </h1>
          <p className="text-gray-500 text-sm mt-1">Dashboard seller & admin</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-100 p-8">
          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-gray-600 font-medium">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@restoran.com"
                required
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-500 transition-colors"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-gray-600 font-medium">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-500 transition-colors"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors mt-1"
            >
              {loading ? "Masuk..." : "Masuk"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Kantin — Multi-tenant food ordering platform
        </p>
      </div>
    </div>
  );
}
