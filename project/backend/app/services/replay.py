"""Demo mode: replay supplied events against a simulated clock. Owner: workstream B (T-B3).

Only events with event_time <= sim_time are visible (no look-ahead). On each tick:
  1. fetch new VehicleEvents in (last_tick, sim_time]; fold with core.vehicle_state.apply_event
  2. evaluate core.detector for every at-rest bicycle (a bike becomes abandoned with no new event)
  3. services.cases.sync_vehicle for each result
Run the tick loop as an asyncio background task started from /replay/start.
"""
from datetime import datetime, timedelta

from app.config import settings
from app.schemas import ReplayState


class ReplayEngine:
    def __init__(self):
        self.sim_time: datetime | None = None
        self.speed = settings.replay_speed
        self.running = False

    def state(self) -> ReplayState:
        return ReplayState(running=self.running, sim_time=self.sim_time, speed=self.speed)

    def start(self, from_time: datetime | None, speed: float | None) -> ReplayState:
        self.sim_time = from_time or self.sim_time
        self.speed = speed or self.speed
        self.running = True  # TODO(T-B3): launch background tick loop
        return self.state()

    def pause(self) -> ReplayState:
        self.running = False
        return self.state()

    def step(self, minutes: float) -> ReplayState:
        if self.sim_time:
            self.sim_time += timedelta(minutes=minutes)  # TODO(T-B3): run tick()
        return self.state()


engine = ReplayEngine()
