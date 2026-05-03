"""Kuramoto / Kuramoto-Lohe oscillator solvers.

Reusable functions for simulating coupled oscillator systems on S^1 and S^{d-1}.
Extracted from toiletpaper simulation runs.

Usage:
    from kuramoto import order_parameter, kuramoto_step, sweep_coupling
"""

import numpy as np
from scipy.integrate import solve_ivp


def order_parameter(theta):
    """Kuramoto order parameter r = |1/N sum exp(i theta_j)|."""
    return np.abs(np.mean(np.exp(1j * np.asarray(theta))))


def kuramoto_rhs(t, theta, K, omega, N):
    """RHS for Kuramoto ODE: d theta_i/dt = omega_i + (K/N) sum sin(theta_j - theta_i)."""
    theta = np.asarray(theta)
    sin_diff = np.sin(theta[np.newaxis, :] - theta[:, np.newaxis])
    coupling = (K / N) * np.sum(sin_diff, axis=1)
    return omega + coupling


def kuramoto_step(theta, omega, K, N, dt):
    """Single Euler step for Kuramoto dynamics."""
    sin_diff = np.sin(theta[np.newaxis, :] - theta[:, np.newaxis])
    coupling = (K / N) * np.sum(sin_diff, axis=1)
    return theta + dt * (omega + coupling)


def lohe_step(Z, K, dt):
    """Single Euler step for Lohe model on S^{d-1}.

    Z: (N, d) array of unit vectors on the hypersphere.
    Returns updated Z with rows re-normalized to unit length.
    """
    Z = np.asarray(Z, dtype=float)
    Z_bar = Z.mean(axis=0)
    proj = Z_bar - np.sum(Z * Z_bar, axis=1, keepdims=True) * Z
    Z_new = Z + K * dt * proj
    norms = np.linalg.norm(Z_new, axis=1, keepdims=True)
    norms = np.where(norms > 0, norms, 1.0)
    return Z_new / norms


def steady_state_r(N, K, omega, T=100, dt=0.01, T_transient=50, seed=42):
    """Run Kuramoto to steady state and return time-averaged order parameter."""
    rng = np.random.default_rng(seed)
    theta = rng.uniform(0, 2 * np.pi, N)
    steps = int(T / dt)
    transient_steps = int(T_transient / dt)
    r_samples = []
    for s in range(steps):
        theta = kuramoto_step(theta, omega, K, N, dt)
        if s >= transient_steps:
            r_samples.append(order_parameter(theta))
    return float(np.mean(r_samples))


def sweep_coupling(N, K_values, gamma=1.0, T=100, dt=0.01,
                   T_transient=50, seed=42, distribution="lorentzian"):
    """Sweep coupling strength K and return (K_values, r_values).

    distribution: "lorentzian" (Cauchy) or "gaussian".
    For Lorentzian with half-width gamma, exact K_c = 2*gamma.
    """
    rng = np.random.default_rng(seed)
    if distribution == "lorentzian":
        omega = rng.standard_cauchy(N) * gamma
        omega = np.clip(omega, -10 * gamma, 10 * gamma)
    else:
        omega = rng.normal(0, gamma, N)

    r_values = []
    for K in K_values:
        r = steady_state_r(N, K, omega, T=T, dt=dt,
                           T_transient=T_transient, seed=seed)
        r_values.append(r)
    return np.array(K_values), np.array(r_values)
