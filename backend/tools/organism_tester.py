import json
import threading
import time
import tkinter as tk
from tkinter import messagebox, ttk
from typing import Any, Dict, Optional

import requests

API_BASE = "http://127.0.0.1:8000"
REFRESH_INTERVAL = 5.0


class OrganismTester(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("EtinuxE Organism Tester")
        self.geometry("920x640")
        self._stop_event = threading.Event()
        self._auto_refresh = tk.BooleanVar(value=True)
        self._build_layout()
        self._start_refresh()

    def destroy(self) -> None:  # type: ignore[override]
        self._stop_event.set()
        super().destroy()

    def _build_layout(self) -> None:
        root = ttk.Notebook(self)
        root.pack(fill=tk.BOTH, expand=True)

        state_frame = ttk.Frame(root, padding=12)
        feed_frame = ttk.Frame(root, padding=12)
        sleep_frame = ttk.Frame(root, padding=12)
        memory_frame = ttk.Frame(root, padding=12)
        dream_frame = ttk.Frame(root, padding=12)

        root.add(state_frame, text="Organism State")
        root.add(feed_frame, text="Feed Organism")
        root.add(sleep_frame, text="Sleep Cycle")
        root.add(memory_frame, text="Memory Log")
        root.add(dream_frame, text="Dream Engine")

        self._build_state_tab(state_frame)
        self._build_feed_tab(feed_frame)
        self._build_sleep_tab(sleep_frame)
        self._build_memory_tab(memory_frame)
        self._build_dream_tab(dream_frame)

    def _build_state_tab(self, container: ttk.Frame) -> None:
        header = ttk.Frame(container)
        header.pack(fill=tk.X, pady=(0, 8))

        ttk.Label(header, text="Auto Refresh", padding=(0, 0, 8, 0)).pack(side=tk.LEFT)
        ttk.Checkbutton(header, variable=self._auto_refresh).pack(side=tk.LEFT)
        ttk.Button(header, text="Refresh Now", command=self.refresh_state).pack(side=tk.RIGHT)

        self._state_text = tk.Text(container, height=20, wrap=tk.WORD)
        self._state_text.pack(fill=tk.BOTH, expand=True)
        self._state_text.configure(state=tk.DISABLED)

        self._status_bar = ttk.Label(container, text="Ready", anchor=tk.W)
        self._status_bar.pack(fill=tk.X, pady=(6, 0))

    def _build_feed_tab(self, container: ttk.Frame) -> None:
        fields = [
            ("sensory_intensity", "0.5"),
            ("emotional_tone", "0.0"),
            ("ambient_motion", "0.4"),
            ("data_volume", "3.0"),
        ]
        self._feed_entries = {}
        for idx, (name, default) in enumerate(fields):
            label = ttk.Label(container, text=name.replace("_", " ").title())
            label.grid(row=idx, column=0, sticky=tk.W, pady=4)
            entry = ttk.Entry(container)
            entry.insert(0, default)
            entry.grid(row=idx, column=1, sticky=tk.EW, pady=4)
            self._feed_entries[name] = entry

        container.columnconfigure(1, weight=1)
        ttk.Button(container, text="Submit Feed", command=self.feed_organism).grid(row=len(fields), column=0, columnspan=2, pady=12)

    def _build_sleep_tab(self, container: ttk.Frame) -> None:
        fields = [
            ("duration_hours", "6"),
            ("quality", "0.6"),
        ]
        self._sleep_entries = {}
        for idx, (name, default) in enumerate(fields):
            label = ttk.Label(container, text=name.replace("_", " ").title())
            label.grid(row=idx, column=0, sticky=tk.W, pady=4)
            entry = ttk.Entry(container)
            entry.insert(0, default)
            entry.grid(row=idx, column=1, sticky=tk.EW, pady=4)
            self._sleep_entries[name] = entry

        container.columnconfigure(1, weight=1)
        self._abrupt_wake = tk.BooleanVar()
        ttk.Checkbutton(container, text="Abrupt Wake", variable=self._abrupt_wake).grid(row=len(fields), column=0, columnspan=2, pady=4)
        ttk.Button(container, text="Run Sleep Cycle", command=self.run_sleep_cycle).grid(row=len(fields) + 1, column=0, columnspan=2, pady=12)

    def _build_memory_tab(self, container: ttk.Frame) -> None:
        labels = [
            ("user_id", ""),
            ("memory_text", ""),
            ("valence", "0.2"),
            ("strength", "0.6"),
            ("toxicity", "0.1"),
            ("embedding", "0.12, 0.08"),
        ]
        self._memory_widgets = {}
        for idx, (name, default) in enumerate(labels):
            label = ttk.Label(container, text=name.replace("_", " ").title())
            label.grid(row=idx, column=0, sticky=tk.NW, pady=4)
            if name == "memory_text":
                widget = tk.Text(container, height=5, wrap=tk.WORD)
                widget.insert(tk.END, default)
            else:
                widget = ttk.Entry(container)
                widget.insert(0, default)
            widget.grid(row=idx, column=1, sticky=tk.EW, pady=4)
            self._memory_widgets[name] = widget

        container.columnconfigure(1, weight=1)
        ttk.Button(container, text="Record Memory", command=self.record_memory).grid(row=len(labels), column=0, columnspan=2, pady=12)

    def _build_dream_tab(self, container: ttk.Frame) -> None:
        ttk.Button(container, text="Generate Dream", command=self.generate_dream).pack(pady=8, fill=tk.X)
        ttk.Button(container, text="Sleep Cycle (6h, 0.6)", command=self._quick_sleep).pack(pady=4, fill=tk.X)
        ttk.Button(container, text="Refresh State", command=self.refresh_state).pack(pady=4, fill=tk.X)

        self._dream_log = tk.Text(container, height=18, wrap=tk.WORD)
        self._dream_log.pack(fill=tk.BOTH, expand=True, pady=(8, 0))
        self._dream_log.configure(state=tk.DISABLED)

    def _start_refresh(self) -> None:
        def refresh_loop() -> None:
            while not self._stop_event.wait(REFRESH_INTERVAL):
                if self._auto_refresh.get():
                    try:
                        self.refresh_state()
                    except Exception:
                        pass

        thread = threading.Thread(target=refresh_loop, daemon=True)
        thread.start()

    def _set_status(self, message: str) -> None:
        self._status_bar.configure(text=message)

    def _update_text(self, widget: tk.Text, content: str) -> None:
        widget.configure(state=tk.NORMAL)
        widget.delete("1.0", tk.END)
        widget.insert(tk.END, content)
        widget.configure(state=tk.DISABLED)

    def _request(self, method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        url = f"{API_BASE}{path}"
        try:
            response = requests.request(method, url, json=payload, timeout=10)
            response.raise_for_status()
            return response.json() if response.content else {}
        except requests.RequestException as exc:
            messagebox.showerror("Request Failed", f"{method} {path}\n{exc}")
            raise

    def refresh_state(self) -> None:
        try:
            data = self._request("GET", "/organism/state")
        except Exception:
            return
        pretty = json.dumps(data, indent=2)
        self._update_text(self._state_text, pretty)
        self._set_status("State refreshed")

    def feed_organism(self) -> None:
        payload = {}
        for name, entry in self._feed_entries.items():
            try:
                payload[name] = float(entry.get())
            except ValueError:
                messagebox.showerror("Invalid Input", f"{name} must be numeric")
                return
        try:
            self._request("POST", "/organism/feed", {"profile": payload})
            self.refresh_state()
            self._set_status("Feed submitted")
        except Exception:
            return

    def run_sleep_cycle(self) -> None:
        try:
            duration = float(self._sleep_entries["duration_hours"].get())
            quality = float(self._sleep_entries["quality"].get())
        except ValueError:
            messagebox.showerror("Invalid Input", "Duration and quality must be numeric")
            return
        payload = {
            "duration_hours": duration,
            "quality": quality,
            "abrupt_wake": self._abrupt_wake.get(),
        }
        try:
            self._request("POST", "/dreams/sleep-cycle", payload)
            self.refresh_state()
            self._set_status("Sleep cycle completed")
        except Exception:
            return

    def record_memory(self) -> None:
        user_id = self._memory_widgets["user_id"].get().strip()
        if not user_id:
            messagebox.showerror("Missing Field", "user_id is required")
            return
        memory_text_widget = self._memory_widgets["memory_text"]
        memory_text = memory_text_widget.get("1.0", tk.END).strip()
        if not memory_text:
            messagebox.showerror("Missing Field", "memory_text is required")
            return
        try:
            valence = float(self._memory_widgets["valence"].get())
            strength = float(self._memory_widgets["strength"].get())
            toxicity = float(self._memory_widgets["toxicity"].get())
        except ValueError:
            messagebox.showerror("Invalid Input", "Valence, strength, and toxicity must be numeric")
            return
        embedding_raw = self._memory_widgets["embedding"].get()
        try:
            embedding = [float(part.strip()) for part in embedding_raw.split(",") if part.strip()]
            if len(embedding) < 2:
                raise ValueError
        except ValueError:
            messagebox.showerror("Invalid Input", "Embedding must contain at least two numeric values")
            return

        payload = {
            "valence": valence,
            "strength": strength,
            "toxicity": toxicity,
            "embedding": embedding,
            "memory_text": memory_text,
        }
        try:
            response = self._request("POST", f"/memories/{user_id}", payload)
            self._append_dream_log("Memory recorded", response)
            self.refresh_state()
        except Exception:
            return

    def generate_dream(self) -> None:
        try:
            response = self._request("POST", "/dreams/generate", {})
            self._append_dream_log("Dream generated", response)
            self.refresh_state()
        except Exception:
            return

    def _quick_sleep(self) -> None:
        try:
            response = self._request("POST", "/dreams/sleep-cycle", {"duration_hours": 6, "quality": 0.6, "abrupt_wake": False})
            self._append_dream_log("Sleep cycle (quick)", response)
            self.refresh_state()
        except Exception:
            return

    def _append_dream_log(self, title: str, payload: Dict[str, Any]) -> None:
        message = f"{time.strftime('%H:%M:%S')} :: {title}\n{json.dumps(payload, indent=2)}\n\n"
        self._dream_log.configure(state=tk.NORMAL)
        self._dream_log.insert(tk.END, message)
        self._dream_log.see(tk.END)
        self._dream_log.configure(state=tk.DISABLED)
        self._set_status(title)


def main() -> None:
    app = OrganismTester()
    app.mainloop()


if __name__ == "__main__":
    main()
