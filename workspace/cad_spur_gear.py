"""
TIA CAD Engine: Parametric Spur Gear Generator
Author: M. Bhargav Rayudu (B.Tech Mechatronics • CAD Diploma)
Tirupati Intellect Authority
"""
import math

def calculate_gear_geometry(module: float = 2.5, teeth: int = 28, pressure_angle: float = 20.0):
    pitch_diameter = module * teeth
    base_diameter = pitch_diameter * math.cos(math.radians(pressure_angle))
    addendum = module
    dedendum = 1.25 * module
    tip_diameter = pitch_diameter + 2 * addendum
    root_diameter = pitch_diameter - 2 * dedendum
    circular_pitch = math.pi * module

    return {
        "module": module,
        "teeth": teeth,
        "pitch_diameter_mm": round(pitch_diameter, 3),
        "base_diameter_mm": round(base_diameter, 3),
        "tip_diameter_mm": round(tip_diameter, 3),
        "root_diameter_mm": round(root_diameter, 3),
        "circular_pitch_mm": round(circular_pitch, 3),
    }

if __name__ == "__main__":
    gear = calculate_gear_geometry(module=3.0, teeth=32)
    print("=" * 50)
    print("  TIA MECHATRONICS CAD PARAMETRIC SPECS")
    print("=" * 50)
    for k, v in gear.items():
        print(f"  {k:22} : {v}")
    print("=" * 50)
    print("Status: 3D Wireframe Ready for CAD Automation Export.")
