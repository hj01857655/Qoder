# Qoder 注册助手 / Qoder Registration Assistant

[English](#english) | [中文](#chinese)

---

## English

A Tampermonkey/Scriptcat script for Qoder website that provides automatic registration functionality.

### 🚀 Features

#### ✨ Main Features
- **Automatic Form Filling**: Automatically fills in name, email, password and other registration information
- **Smart Stage Detection**: Automatically detects current registration stage and performs corresponding operations
- **Human Verification Assistance**: Simulates human behavior for captcha verification
- **Detailed Logging**: Real-time display of operation process and status
- **Login Page Entry**: Provides quick jump button to registration page on login page

#### 🎯 Supported Registration Stages
1. **Stage 1**: Name and email filling
2. **Stage 2**: Password setting
3. **Stage 3**: Human verification
4. **Stage 4**: Email verification code (manual input required)

### 📦 Installation

#### Method 1: Install via Tampermonkey
1. Ensure Tampermonkey browser extension is installed
2. Choose your preferred version:
   - **Entertainment Version** (Auto-generated email): 
     ```
     https://raw.githubusercontent.com/hj01857655/Qoder/master/qoder.user.js
     ```
   - **Custom Email Version** (User input email):
     ```
     https://raw.githubusercontent.com/hj01857655/Qoder/master/qoder_custom_email.user.js
     ```

#### Method 2: Install via Scriptcat
1. Ensure Scriptcat browser extension is installed
   - [Chrome Web Store](https://chrome.google.com/webstore/detail/scriptcat/ndcooeababalnlpkfedmmbbbgkljhpjf)
   - [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/%E8%84%9A%E6%9C%AC%E7%8C%AB/liilgpjgabokdklappibcjfablkpcekh)
   - [Direct Download](https://github.com/scriptscat/scriptcat/releases/download/v1.0.1/scriptcat-v1.0.1-chrome.crx)
2. Choose your preferred version:
   - **Entertainment Version** (Auto-generated email): 
     ```
     https://raw.githubusercontent.com/hj01857655/Qoder/master/qoder.user.js
     ```
   - **Custom Email Version** (User input email):
     ```
     https://raw.githubusercontent.com/hj01857655/Qoder/master/qoder_custom_email.user.js
     ```

#### Method 3: Manual Installation
1. Open Tampermonkey or Scriptcat management panel
2. Click "New Script"
3. Copy and paste the script content into the editor
4. Save the script (Ctrl+S)

### 📋 Version Comparison

| Feature | Entertainment Version | Custom Email Version |
|---------|---------------------|---------------------|
| **Email Source** | Auto-generated random email | User manually input email |
| **Email Control** | Script automatically generates | User has full control |
| **Use Case** | Batch registration testing | Real email registration |
| **User Experience** | No user input required | Requires email input |
| **Flexibility** | Limited to generated emails | High flexibility |
| **Suitability** | Testing and entertainment | Production use |

### 🎮 Usage

#### On Login Page
- A "🚀 Go to Register" button will appear in the top right corner
- Click the button to directly jump to the registration page

#### On Registration Page
- A "🚀" floating button will appear in the top right corner
- Click the button to open the registration assistant panel
- Click "Start Registration" button to begin the automatic registration process

#### Panel Features
- **Start Registration**: Launch automatic registration process
- **Current Stage**: Display current registration stage
- **Operation Log**: Real-time display of operation records
- **Clear Log**: Clear log records

### 🔧 Technical Features

#### Smart Form Processing
- Supports React Ant Design form components
- Multiple input value setting methods ensure compatibility
- Automatic handling of form validation and state updates

#### Human Verification Simulation
- Bezier curve mouse movement trajectory
- Randomized time intervals and click behaviors
- Multiple verification state detection mechanisms

#### Route Change Monitoring
- Supports SPA application route changes
- Automatic page jump detection
- Smart show/hide of corresponding features

### 📝 Changelog

#### v1.0 (2025-01-XX)
- 🎉 Initial version release
- ✨ Complete automatic registration process implementation
- 🎯 Added login page entry button
- 📊 Integrated detailed logging system
- 🤖 Implemented human verification simulation function

### ⚠️ Disclaimer

This script is for learning and research purposes only. Users must comply with the relevant website's terms of use and applicable laws and regulations. The developer is not responsible for any consequences arising from the use of this script.

### 🤝 Contributing

Welcome to submit Issues and Pull Requests to improve this project.

### 📄 License

This project is licensed under the MIT License.

### 👨‍💻 Author

**hj0185765**

---

## Chinese

一个用于Qoder网站的Tampermonkey/Scriptcat脚本，提供自动注册功能。

### 🚀 功能特性

#### ✨ 主要功能
- **自动表单填写**：自动填写姓名、邮箱、密码等注册信息
- **智能阶段检测**：自动检测当前注册阶段并执行相应操作
- **人机验证辅助**：模拟人类行为进行验证码验证
- **详细日志记录**：实时显示操作过程和状态
- **登录页面入口**：在登录页面提供快速跳转到注册页面的按钮

#### 🎯 支持的注册阶段
1. **第一阶段**：姓名和邮箱填写
2. **第二阶段**：密码设置
3. **第三阶段**：人机验证
4. **第四阶段**：邮箱验证码（需要手动输入）

### 📦 安装方法

#### 方法一：通过Tampermonkey安装
1. 确保已安装Tampermonkey浏览器扩展
2. 选择您偏好的版本：
   - **娱乐版**（自动生成邮箱）： 
     ```
     https://raw.githubusercontent.com/hj01857655/Qoder/master/qoder.user.js
     ```
   - **自定义邮箱版本**（用户输入邮箱）：
     ```
     https://raw.githubusercontent.com/hj01857655/Qoder/master/qoder_custom_email.user.js
     ```

#### 方法二：通过Scriptcat安装
1. 确保已安装Scriptcat浏览器扩展
   - [Chrome Web Store](https://chrome.google.com/webstore/detail/scriptcat/ndcooeababalnlpkfedmmbbbgkljhpjf)
   - [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/%E8%84%9A%E6%9C%AC%E7%8C%AB/liilgpjgabokdklappibcjfablkpcekh)
   - [直接下载](https://github.com/scriptscat/scriptcat/releases/download/v1.0.1/scriptcat-v1.0.1-chrome.crx)
2. 选择您偏好的版本：
   - **娱乐版**（自动生成邮箱）： 
     ```
     https://raw.githubusercontent.com/hj01857655/Qoder/master/qoder.user.js
     ```
   - **自定义邮箱版本**（用户输入邮箱）：
     ```
     https://raw.githubusercontent.com/hj01857655/Qoder/master/qoder_custom_email.user.js
     ```

#### 方法三：手动安装
1. 打开Tampermonkey或Scriptcat管理面板
2. 点击"新建脚本"
3. 将脚本内容复制粘贴到编辑器中
4. 保存脚本（Ctrl+S）

### 📋 版本对比

| 功能特性 | 娱乐版 | 自定义邮箱版本 |
|---------|-------|---------------|
| **邮箱来源** | 自动生成随机邮箱 | 用户手动输入邮箱 |
| **邮箱控制** | 脚本自动生成 | 用户完全控制 |
| **使用场景** | 批量注册测试 | 真实邮箱注册 |
| **用户体验** | 无需用户输入 | 需要用户输入邮箱 |
| **灵活性** | 限于生成的邮箱 | 高度灵活 |
| **适用性** | 测试和娱乐 | 生产环境使用 |

### 🎮 使用方法

#### 在登录页面
- 页面右上角会显示"🚀 去注册"按钮
- 点击按钮直接跳转到注册页面

#### 在注册页面
- 页面右上角会显示"🚀"悬浮按钮
- 点击按钮打开注册助手面板
- 点击"开始注册"按钮开始自动注册流程

#### 面板功能
- **开始注册**：启动自动注册流程
- **当前阶段**：显示当前注册阶段
- **操作日志**：实时显示操作记录
- **清空日志**：清除日志记录

### 🔧 技术特性

#### 智能表单处理
- 支持React Ant Design表单组件
- 多种输入值设置方法确保兼容性
- 自动处理表单验证和状态更新

#### 人机验证模拟
- 贝塞尔曲线鼠标移动轨迹
- 随机化时间间隔和点击行为
- 多重验证状态检测机制

#### 路由变化监听
- 支持SPA应用的路由变化
- 自动检测页面跳转
- 智能显示/隐藏相应功能

### 📝 更新日志

#### v1.0 (2025-01-XX)
- 🎉 初始版本发布
- ✨ 实现完整的自动注册流程
- 🎯 添加登录页面入口按钮
- 📊 集成详细日志记录系统
- 🤖 实现人机验证模拟功能

### ⚠️ 免责声明

本脚本仅供学习和研究目的使用。使用者需要遵守相关网站的使用条款和法律法规。开发者不对使用本脚本产生的任何后果承担责任。

### 🤝 贡献

欢迎提交Issue和Pull Request来改进这个项目。

### 📄 许可证

本项目采用MIT许可证。

### 👨‍💻 作者

**hj0185765**

---

⭐ 如果这个项目对您有帮助，请给个Star支持一下！ / ⭐ If this project helps you, please give it a Star!
