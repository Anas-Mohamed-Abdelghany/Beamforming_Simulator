"""
BeamSweeper — manages continuous 360° sweep angle progression.

Supports three sweep modes:
  - 'continuous': wraps at ±180°
  - 'bounce': reverses direction at sector boundaries
  - 'sector': same as bounce (sweeps between sector_min and sector_max)
"""


class BeamSweeper:
    """
    Tracks a radar beam's current steering angle and advances it each tick.

    Attributes
    ----------
    angle_deg : float
        Current sweep angle in degrees.
    speed_deg_per_sec : float
        Angular velocity (always positive; direction handled by mode).
    mode : str
        'continuous' | 'bounce' | 'sector'
    sector_min : float
        Minimum angle for sector/bounce mode.
    sector_max : float
        Maximum angle for sector/bounce mode.
    _direction : int
        +1 or -1 (used in 'bounce' and 'sector' modes).
    """

    def __init__(
        self,
        start_deg: float = 0.0,
        speed_deg_per_sec: float = 45.0,
        mode: str = "continuous",
        sector_min: float = -60.0,
        sector_max: float = 60.0,
    ) -> None:
        """
        Initialise the beam sweeper.

        Parameters
        ----------
        start_deg : float
            Initial sweep angle in degrees.
        speed_deg_per_sec : float
            Angular velocity in degrees per second.
        mode : str
            Sweep mode: 'continuous', 'bounce', or 'sector'.
        sector_min : float
            Minimum angle for sector/bounce modes.
        sector_max : float
            Maximum angle for sector/bounce modes.
        """
        self.angle_deg: float = start_deg
        self.speed_deg_per_sec: float = speed_deg_per_sec
        self.mode: str = mode
        self.sector_min: float = sector_min
        self.sector_max: float = sector_max
        self._direction: int = 1

    def tick(self, dt: float) -> float:
        """
        Advance the sweep angle by speed × dt.

        Behaviour by mode:
        - 'continuous': wraps at ±180° → stays in [-180, 180)
        - 'bounce': reverses direction at sector_min / sector_max
        - 'sector': same as bounce

        Parameters
        ----------
        dt : float
            Time step in seconds.

        Returns
        -------
        float
            The new angle_deg after advancing.
        """
        step = self.speed_deg_per_sec * dt

        if self.mode == "continuous":
            self.angle_deg += step
            # Wrap to [-180, 180)
            while self.angle_deg >= 180.0:
                self.angle_deg -= 360.0
            while self.angle_deg < -180.0:
                self.angle_deg += 360.0
        else:
            # bounce / sector
            self.angle_deg += self._direction * step
            if self.angle_deg >= self.sector_max:
                self.angle_deg = self.sector_max
                self._direction = -1
            elif self.angle_deg <= self.sector_min:
                self.angle_deg = self.sector_min
                self._direction = 1

        return self.angle_deg

    def get_illuminated_range(self, beam_width_deg: float) -> tuple:
        """
        Return (min_angle, max_angle) of the currently illuminated sector.

        Parameters
        ----------
        beam_width_deg : float
            Half-power beam width in degrees.

        Returns
        -------
        tuple[float, float]
            (min_angle_deg, max_angle_deg)
        """
        half_bw = beam_width_deg / 2.0
        return (self.angle_deg - half_bw, self.angle_deg + half_bw)

    def reset(self, angle_deg: float = 0.0) -> None:
        """
        Reset sweep to a specific angle.

        Parameters
        ----------
        angle_deg : float
            The angle to reset to.
        """
        self.angle_deg = angle_deg
        self._direction = 1
