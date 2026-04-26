"""
KAN (Kolmogorov-Arnold Network) and MLP implementations from scratch.
Used by all simulation scripts in this directory.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np


def compute_bspline_basis(x, grid, k):
    """
    Compute B-spline basis functions of degree k using Cox-de Boor recursion.

    Args:
        x: (batch_size,) input values
        grid: (G + 2k + 1,) extended knot vector
        k: spline degree
    Returns:
        (batch_size, G + k) basis function values
    """
    x = x.unsqueeze(-1)  # (batch, 1)

    # Degree 0: indicator functions
    bases = ((x >= grid[:-1]) & (x < grid[1:])).float()  # (batch, n_knots-1)

    for p in range(1, k + 1):
        n = bases.shape[1] - 1
        # Left: (x - t_i) / (t_{i+p} - t_i)
        left_num = x - grid[:n]
        left_den = (grid[p : p + n] - grid[:n]).clamp(min=1e-8)
        left = (left_num / left_den) * bases[:, :n]

        # Right: (t_{i+p+1} - x) / (t_{i+p+1} - t_{i+1})
        right_num = grid[p + 1 : p + 1 + n] - x
        right_den = (grid[p + 1 : p + 1 + n] - grid[1 : 1 + n]).clamp(min=1e-8)
        right = (right_num / right_den) * bases[:, 1 : 1 + n]

        bases = left + right

    # Include right boundary in last basis function
    bases[:, -1] += (x.squeeze(-1) >= grid[-k - 1]).float()

    return bases


class KANLayer(nn.Module):
    def __init__(self, in_features, out_features, grid_size=5, spline_order=3,
                 grid_range=(-1, 1)):
        super().__init__()
        self.in_features = in_features
        self.out_features = out_features
        self.grid_size = grid_size
        self.spline_order = spline_order

        h = (grid_range[1] - grid_range[0]) / grid_size
        grid = torch.linspace(
            grid_range[0] - spline_order * h,
            grid_range[1] + spline_order * h,
            grid_size + 2 * spline_order + 1,
        )
        self.register_buffer("grid", grid)

        n_basis = grid_size + spline_order
        self.coeff = nn.Parameter(
            torch.randn(out_features, in_features, n_basis)
            / np.sqrt(in_features * n_basis)
        )
        self.base_weight = nn.Parameter(
            torch.randn(out_features, in_features) / np.sqrt(in_features)
        )
        self.spline_weight = nn.Parameter(torch.ones(out_features, in_features))

    def forward(self, x):
        # x: (batch, in_features)
        batch_size = x.shape[0]

        # Flatten all input features, compute basis, reshape
        x_flat = x.reshape(-1)  # (batch * in_features,)
        bases_flat = compute_bspline_basis(x_flat, self.grid, self.spline_order)
        bases = bases_flat.reshape(batch_size, self.in_features, -1)

        # Spline: einsum over basis dimension
        spline_out = torch.einsum("bin,oin->boi", bases, self.coeff)
        spline_out = spline_out * self.spline_weight.unsqueeze(0)

        # Base function (SiLU residual)
        base_out = F.silu(x).unsqueeze(1)  # (batch, 1, in)
        base_out = base_out * self.base_weight.unsqueeze(0)

        # Sum over input dimension
        out = (spline_out + base_out).sum(dim=2)
        return out

    def extra_repr(self):
        return (f"in={self.in_features}, out={self.out_features}, "
                f"G={self.grid_size}, k={self.spline_order}")


class KAN(nn.Module):
    def __init__(self, layer_sizes, grid_size=5, spline_order=3, grid_range=(-1, 1)):
        super().__init__()
        self.layer_sizes = layer_sizes
        self.grid_size = grid_size
        self.spline_order = spline_order
        self.kan_layers = nn.ModuleList()
        for i in range(len(layer_sizes) - 1):
            self.kan_layers.append(KANLayer(
                layer_sizes[i], layer_sizes[i + 1],
                grid_size=grid_size, spline_order=spline_order,
                grid_range=grid_range,
            ))

    def forward(self, x):
        for layer in self.kan_layers:
            x = layer(x)
        return x

    def count_params(self):
        return sum(p.numel() for p in self.parameters())


class MLP(nn.Module):
    def __init__(self, layer_sizes, activation="relu"):
        super().__init__()
        self.layer_sizes = layer_sizes
        layers = []
        for i in range(len(layer_sizes) - 1):
            layers.append(nn.Linear(layer_sizes[i], layer_sizes[i + 1]))
            if i < len(layer_sizes) - 2:
                if activation == "relu":
                    layers.append(nn.ReLU())
                elif activation == "tanh":
                    layers.append(nn.Tanh())
                elif activation == "silu":
                    layers.append(nn.SiLU())
        self.net = nn.Sequential(*layers)

    def forward(self, x):
        return self.net(x)

    def count_params(self):
        return sum(p.numel() for p in self.parameters())


def generate_data(func, dim, n_samples, x_range=(-1, 1), seed=42):
    """Generate training/test data for a target function."""
    rng = np.random.RandomState(seed)
    x = rng.uniform(x_range[0], x_range[1], (n_samples, dim)).astype(np.float32)
    x_t = torch.from_numpy(x)
    y_t = func(x_t).unsqueeze(-1) if func(x_t).dim() == 1 else func(x_t)
    return x_t, y_t


def train_model(model, x_train, y_train, x_test, y_test, epochs=500, lr=0.01,
                verbose=False, log_interval=100):
    """Train a model and return metrics."""
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, epochs)

    train_log = []
    test_log = []

    for epoch in range(epochs):
        model.train()
        optimizer.zero_grad()
        pred = model(x_train)
        loss = F.mse_loss(pred, y_train)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 10.0)
        optimizer.step()
        scheduler.step()

        if (epoch + 1) % log_interval == 0 or epoch == 0:
            model.eval()
            with torch.no_grad():
                test_pred = model(x_test)
                test_loss = F.mse_loss(test_pred, y_test)
            train_log.append(loss.item())
            test_log.append(test_loss.item())
            if verbose:
                print(f"  Epoch {epoch+1}/{epochs}: "
                      f"train_mse={loss.item():.4e} test_mse={test_loss.item():.4e}")

    model.eval()
    with torch.no_grad():
        final_train = torch.sqrt(F.mse_loss(model(x_train), y_train)).item()
        final_test = torch.sqrt(F.mse_loss(model(x_test), y_test)).item()

    return {
        "train_rmse": final_train,
        "test_rmse": final_test,
        "train_log": train_log,
        "test_log": test_log,
    }


def fit_power_law(x_vals, y_vals):
    """Fit y = a * x^b via log-log linear regression. Returns (a, b, r_squared)."""
    lx = np.log(np.array(x_vals, dtype=np.float64))
    ly = np.log(np.array(y_vals, dtype=np.float64))
    mask = np.isfinite(lx) & np.isfinite(ly)
    lx, ly = lx[mask], ly[mask]
    if len(lx) < 2:
        return 1.0, 0.0, 0.0
    A = np.vstack([lx, np.ones(len(lx))]).T
    result = np.linalg.lstsq(A, ly, rcond=None)
    b, log_a = result[0]
    residuals = ly - (b * lx + log_a)
    ss_res = np.sum(residuals ** 2)
    ss_tot = np.sum((ly - np.mean(ly)) ** 2)
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0
    return np.exp(log_a), b, r2
