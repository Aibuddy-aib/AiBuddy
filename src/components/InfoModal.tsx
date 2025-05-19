import React, { useState } from 'react';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose }) => {
  const [language, setLanguage] = useState<'en' | 'zh' | 'ko' | 'ja'>('en');

  if (!isOpen) return null;

  const content = {
    en: {
      title: "About AI Buddy World",
      description: [
        "Welcome to AI Buddy World, where you can log in with your web3 wallet address and adopt your own AI Buddy.",
        "The generated AI Buddies will freely move around in this virtual world, controlled by AI. Each AI Buddy has their own personality and experiences, and they will encounter various stories in this virtual world!",
        "Here, you can chat with the AIs, make your AI Buddy work to earn AI Buddy Tokens (AIB), use NFTs to help your AI Buddy earn more tokens, and learn skills to increase work earnings.",
        "Various random events happen here every day, such as illness, winning the lottery, receiving bonuses, work injuries, and more... Come and adopt your AI Buddy to experience it!"
      ],
      betaNotice: ["AI Buddy World is in beta testing phase.", "All user data will be recorded and saved."]
    },
    zh: {
      title: "AI Buddy World介绍",
      description: [
        "欢迎来到Ai Buddy World，在这里你可以使用web3钱包地址登录并领养一个属于你自己的Ai Buddy。",
        "生成的Ai Buddy们会自己在这个虚拟世界里由Ai控制自由活动，每个Ai Buddy都会有他们自己的性格与经历，他们会在这个虚拟世界中发生各种各样的故事！",
        "在这里你可以和Ai们对话，让自己的Ai Buddy工作来赚取Ai Buddy Token（AIB），可以使用NFT让自己的Ai Buddy获得更多的Token，也可以学习某种技能来提高工作的收益。",
        "这里每天都会发生各种各样的随机事件，比如生病、中彩票、获得奖金、工作受伤等......快来领养你的Ai Buddy体验吧！"
      ],
      betaNotice: "Ai Buddy World内测阶段，所有用户数据都会记录并且保存。"
    },
    ko: {
      title: "AI 버디 월드 소개",
      description: [
        "AI 버디 월드에 오신 것을 환영합니다. 여기서는 web3 지갑 주소로 로그인하고 자신만의 AI 버디를 입양할 수 있습니다.",
        "생성된 AI 버디들은 AI에 의해 제어되며 이 가상 세계에서 자유롭게 움직입니다. 각 AI 버디는 고유한 성격과 경험을 가지고 있으며, 이 가상 세계에서 다양한 이야기를 경험하게 됩니다!",
        "여기서 AI와 채팅하고, AI 버디를 일하게 하여 AI 버디 토큰(AIB)을 얻고, NFT를 사용하여 더 많은 토큰을 얻거나 기술을 배워 작업 수익을 높일 수 있습니다.",
        "질병, 복권 당첨, 보너스 수령, 작업 중 부상 등 다양한 무작위 이벤트가 매일 발생합니다... 지금 AI 버디를 입양하여 경험해 보세요!"
      ],
      betaNotice: ["AI 버디 월드는 베타 테스트 단계입니다.", "모든 사용자 데이터는 기록되고 저장됩니다."]
    },
    ja: {
      title: "AI バディワールドの紹介",
      description: [
        "AI バディワールドへようこそ。ここではweb3ウォレットアドレスでログインし、あなた自身のAI バディを養子にすることができます。",
        "生成されたAI バディたちはAIによって制御され、この仮想世界で自由に動き回ります。各AI バディは独自の個性と経験を持ち、この仮想世界でさまざまなストーリーを体験します！",
        "ここではAIとチャットしたり、AI バディに働かせてAI バディトークン（AIB）を稼いだり、NFTを使用してより多くのトークンを獲得したり、スキルを学んで仕事の収益を向上させたりできます。",
        "病気、宝くじ当選、ボーナス受け取り、仕事中の怪我など、さまざまなランダムイベントが毎日発生しています...今すぐあなたのAI バディを養子にして体験しましょう！"
      ],
      betaNotice: ["AI バディワールドはベータテスト段階です。", "すべてのユーザーデータは記録および保存されます。"]
    }
  };

  const currentContent = content[language];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
      <div className="bg-gray-900 rounded-lg border border-gray-700 shadow-lg w-11/12 max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-white text-xl font-medium">{currentContent.title}</h2>
          <div className="flex items-center">
            <div className="flex mr-4">
              <button 
                onClick={() => setLanguage('en')}
                className={`px-2 py-1 text-xs ${language === 'en' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                style={{ borderTopLeftRadius: '0.375rem', borderBottomLeftRadius: '0.375rem' }}
              >
                EN
              </button>
              <button 
                onClick={() => setLanguage('zh')}
                className={`px-2 py-1 text-xs ${language === 'zh' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
              >
                中文
              </button>
              <button 
                onClick={() => setLanguage('ko')}
                className={`px-2 py-1 text-xs ${language === 'ko' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
              >
                한국어
              </button>
              <button 
                onClick={() => setLanguage('ja')}
                className={`px-2 py-1 text-xs ${language === 'ja' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                style={{ borderTopRightRadius: '0.375rem', borderBottomRightRadius: '0.375rem' }}
              >
                日本語
              </button>
            </div>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-6 overflow-y-auto flex-grow">
          <div className="text-gray-300 space-y-4">
            {currentContent.description.map((paragraph, index) => (
              <p key={index} className="leading-relaxed">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-gray-700 flex flex-col">
          {/* Beta Testing Notice */}
          <div className="mb-4 text-center">
            {Array.isArray(currentContent.betaNotice) ? 
              currentContent.betaNotice.map((line, index) => (
                <p key={index} className="text-gray-500 text-sm italic">
                  {line}
                </p>
              ))
              :
              <p className="text-gray-500 text-sm italic">
                {currentContent.betaNotice}
              </p>
            }
          </div>
          
          {/* Close button */}
          <div className="flex justify-end">
            <button 
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InfoModal; 