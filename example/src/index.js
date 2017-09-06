import $ from 'jquery';
import lemonJuice from '../../src/index.js';

const resizeResponsive = function () {
  const $window = $(window);
  const $source = $('#source');  

  const boxWidth  = $window.width() / 2 - 10;
  const boxHeight = $window.height() - $source.position().top - 15;

  $('#source').css('width', boxWidth).css('height', boxHeight);
  $('#target').css('width', boxWidth).css('height', boxHeight);
};

lemonJuice.run(document.getElementById('source'), document.getElementById('target'));
resizeResponsive();

$(window).resize(resizeResponsive);
