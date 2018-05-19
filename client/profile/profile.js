window.addEventListener('load', () => {
  $username = document.getElementById('username');
  $karma = document.getElementById('karma');
  $picture = document.getElementById('picture');
  
  $picture.src = 'profile_pic_default.svg';
  $username.innerHTML = 'Ming Jiang';
  $karma.innerHTML = `532 karma`;
});