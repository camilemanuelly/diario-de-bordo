import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calcularDias,
  calcularMetricasFolga,
  gerarMapaCalendarioEPrevisao,
  normalizarRegraEscala,
  subtrairUmDiaISO
} from '../js/escalaEngine.js';

test('normalizarRegraEscala usa 10x5 como padrão e aplica mínimo 1 para valores inválidos', () => {
  assert.deepEqual(normalizarRegraEscala({}), {
    diasTrab: 10,
    diasFolg: 5,
    proporcao: 0.5
  });
  assert.deepEqual(normalizarRegraEscala({ dias_trabalho: -2, dias_folga: 0 }), {
    diasTrab: 1,
    diasFolg: 1,
    proporcao: 1
  });
  assert.deepEqual(normalizarRegraEscala({ dias_trabalho: 14, dias_folga: 7 }), {
    diasTrab: 14,
    diasFolg: 7,
    proporcao: 0.5
  });
});

test('calcularDias conta de forma inclusiva e subtrairUmDiaISO recua 1 dia', () => {
  assert.equal(calcularDias('2026-11-01', '2026-11-10'), 10);
  assert.equal(calcularDias('2026-11-10', '2026-11-10'), 1);
  assert.equal(subtrairUmDiaISO('2026-11-01'), '2026-10-31');
});

test('calcularMetricasFolga calcula saldo acumulado na escala 10x5', () => {
  const registros = [
    { tipo: 'Embarque', data_inicio: '2026-11-01', data_fim: '2026-11-10' },
    { tipo: 'Folga', data_inicio: '2026-11-11', data_fim: '2026-11-13' }
  ];

  const metricas = calcularMetricasFolga(registros, {
    diasTrab: 10,
    diasFolg: 5,
    proporcao: 0.5
  });

  assert.equal(metricas.diasTrabalhados, 10);
  assert.equal(metricas.folgasGozadas, 3);
  assert.equal(metricas.folgasGeradas, 5);
  assert.equal(metricas.saldo, 2);
});

test('gerarMapaCalendarioEPrevisao projeta início e fim de folga conforme regra e hojeIso', () => {
  const registros = [
    { id: 1, tipo: 'Embarque', data_inicio: '2026-11-01', data_fim: '2026-11-10' }
  ];

  const { mapaDias, previsao } = gerarMapaCalendarioEPrevisao({
    registros,
    regraEscala: { diasTrab: 10, diasFolg: 5, proporcao: 0.5 },
    hojeIso: '2026-11-08'
  });

  assert.equal(previsao.inicioProximaFolga, '2026-11-09');
  assert.equal(previsao.fimProximaFolga, '2026-11-13');
  assert.equal(previsao.chegouOuPassouPrevisao, false);
  assert.equal(mapaDias['2026-11-09']?.tipo, 'Embarque');
  assert.equal(mapaDias['2026-11-09']?.real, true);
  assert.equal(mapaDias['2026-11-13']?.tipo, 'PrevFolga');
});

test('gerarMapaCalendarioEPrevisao sinaliza aviso pendente quando chega a data da folga sem registro', () => {
  const registros = [
    { id: 1, tipo: 'Embarque', data_inicio: '2026-11-01', data_fim: '2026-11-10' }
  ];

  const { previsao } = gerarMapaCalendarioEPrevisao({
    registros,
    regraEscala: { diasTrab: 10, diasFolg: 5, proporcao: 0.5 },
    hojeIso: '2026-11-11',
    avisoDispensadoData: null,
    continuaTrabalhandoHoje: null
  });

  assert.equal(previsao.chegouOuPassouPrevisao, true);
});