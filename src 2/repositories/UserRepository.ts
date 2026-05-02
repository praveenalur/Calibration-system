import { User, IUser } from '../models/User';

export class UserRepository {
  
  async create(userData: Partial<IUser>): Promise<IUser> {
    const user = new User(userData);
    return await user.save();
  }

  async findAll(): Promise<IUser[]> {
    return await User.find({ is_active: true })
      .select('-password')
      .sort({ created_at: -1 });
  }

  async findById(userId: string): Promise<IUser | null> {
    return await User.findOne({ user_id: userId, is_active: true })
      .select('-password');
  }

  async findByUsername(username: string): Promise<IUser | null> {
    return await User.findOne({ username, is_active: true });
  }

  async findByEmail(email: string): Promise<IUser | null> {
    return await User.findOne({ email, is_active: true });
  }

  async findByUsernameOrEmail(identifier: string): Promise<IUser | null> {
    return await User.findOne({
      $or: [
        { username: identifier },
        { email: identifier }
      ],
      is_active: true
    });
  }

  async update(userId: string, updateData: Partial<IUser>): Promise<IUser | null> {
    return await User.findOneAndUpdate(
      { user_id: userId },
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-password');
  }

  async updateLastLogin(userId: string): Promise<void> {
    await User.findOneAndUpdate(
      { user_id: userId },
      { $set: { last_login: new Date() } }
    );
  }

  async deactivate(userId: string): Promise<boolean> {
    const result = await User.findOneAndUpdate(
      { user_id: userId },
      { $set: { is_active: false } }
    );
    return !!result;
  }

  async findByRole(role: string): Promise<IUser[]> {
    return await User.find({ role, is_active: true })
      .select('-password')
      .sort({ created_at: -1 });
  }

  async getUserStatistics(): Promise<{
    total: number;
    active: number;
    by_role: Record<string, number>;
  }> {
    const [total, active, byRole] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ is_active: true }),
      User.aggregate([
        { $match: { is_active: true } },
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ])
    ]);

    const roleStats = byRole.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {} as Record<string, number>);

    return {
      total,
      active,
      by_role: roleStats
    };
  }
}