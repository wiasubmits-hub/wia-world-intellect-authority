"""
TIA Mechatronics Lab: Robotic Arm Inverse Kinematics Controller
Lead: M. Bhargav Rayudu (B.Tech Mechatronics • CAD Diploma)
"""
import math

class RobotArm2DOF:
    def __init__(self, l1=150.0, l2=120.0):
        self.l1 = l1  # Link 1 length (mm)
        self.l2 = l2  # Link 2 length (mm)

    def inverse_kinematics(self, x, y):
        # Calculate joint angles theta1 and theta2
        r2 = x**2 + y**2
        cos_theta2 = (r2 - self.l1**2 - self.l2**2) / (2 * self.l1 * self.l2)
        
        if abs(cos_theta2) > 1.0:
            return None, None, "Target point out of physical workspace reach!"

        sin_theta2 = math.sqrt(max(0, 1.0 - cos_theta2**2))
        theta2 = math.atan2(sin_theta2, cos_theta2)

        k1 = self.l1 + self.l2 * cos_theta2
        k2 = self.l2 * sin_theta2
        theta1 = math.atan2(y, x) - math.atan2(k2, k1)

        deg1 = math.degrees(theta1)
        deg2 = math.degrees(theta2)
        return round(deg1, 2), round(deg2, 2), "Optimal"

if __name__ == '__main__':
    arm = RobotArm2DOF(180, 140)
    target_x, target_y = 160.0, 120.0
    t1, t2, status = arm.inverse_kinematics(target_x, target_y)
    print(f"[TIA Mechatronics] Targeting Coordinates (X: {target_x}mm, Y: {target_y}mm)")
    print(f" -> Joint 1 Servo Angle: {t1}°")
    print(f" -> Joint 2 Servo Angle: {t2}°")
    print(f" -> Kinematic Solution: {status}")
