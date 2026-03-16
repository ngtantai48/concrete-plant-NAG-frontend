const vi = {
  signIn: {
    username: "Username",
    bigSlogan: "Chào mừng đến với NGUYÊN ANH GROUP!",
    slogan: "Vui lòng đăng nhập vào tài khoản của bạn",
    password: "Mật khẩu",
    rememberMe: "Ghi nhớ tài khoản",
    signIn: "Đăng nhập",
    or: "hoặc",
    validation: {
      required: "là bắt buộc",
      invalid: "không hợp lệ",
    },
    placeholder: {
      password: "**********",
    },
    forget: "Quên mật khẩu?",
    get: "Thay đổi mật khẩu",
  },
  errors: {
    "ERR_AUTH::ALREADY_LOGIN": "Tài khoản đã đăng nhập trên thiết bị khác.",
    "ERR_AUTH::INVALID_CREDENTIALS": "Tên đăng nhập hoặc mật khẩu không đúng.",
    "ERR_COMMON::MISSING_INPUT_DATA": "Tên đăng nhập phải có ít nhất 3 ký tự.\nMật khẩu phải có ít nhất 6 ký tự.",
    "ERR_COMMON::USERNAME_TOO_SHORT": "Tên đăng nhập phải có ít nhất 3 ký tự.",
    "ERR_COMMON::PASSWORD_TOO_SHORT": "Mật khẩu phải có ít nhất 6 ký tự.",
  } as Record<string, string>,
};

export default vi;
